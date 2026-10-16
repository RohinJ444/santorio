'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { useData } from '@/lib/data-store';
import { normalizedTimezone, pastDateError } from '@/lib/domain/settings';
import { BalanceRows, BirthdayRow, EstimateRows, GoalRows, HeightRow, WeightRows, useProfilePatch } from './ProfileParts';
import st from './settings.module.css';

const STEPS = [
  { kicker: '01 · You', title: 'Welcome to Santorio.', lede: 'One place for training, food and the energy between them. What should it call you?' },
  { kicker: '02 · Body', title: 'A few measurements.', lede: 'They drive the energy estimate. Skip anything you don’t know; Apple Health can fill some in later.' },
  { kicker: '03 · Goals', title: 'What you’re aiming for.', lede: 'Below your target always means there’s room left to eat. Change any of this in Settings.' },
];

/** First run, over an extreme close-up of the mesh. Finishing pulls the camera back to the whole body. */
export default function Onboarding({ onDone }: { onDone?: () => void }) {
  const { profile, today } = useData();
  const patch = useProfilePatch();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const finish = () => {
    const message = pastDateError(profile.birthday, today, true);
    if (message) { setError(message); setStep(1); return; }
    patch({ timezone: normalizedTimezone(profile.timezone) ?? 'America/Los_Angeles', onboardingComplete: true });
    onDone?.();
  };
  const { kicker, title, lede } = STEPS[step];
  return <motion.div className={st.onboard} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.6, duration: 0.8 } }} exit={{ opacity: 0, y: 30, transition: { duration: 0.5 } }}>
    <div className={st.brand}>Santorio</div>
    <div className={st.steps} aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((_, i) => <i key={i} data-on={i <= step} />)}</div>
    <section className={`${st.card} ${st.fade}`} key={step} aria-labelledby="onboarding-title">
      <div className={st.kicker}>{kicker}</div>
      <h1 id="onboarding-title" className={st.headline}>{title}</h1>
      <p className={st.lede}>{lede}</p>
      {step === 0 ? <input className={st.nameInput} value={profile.name} onChange={event => patch({ name: event.target.value })} placeholder="Your name" aria-label="Your name" autoComplete="given-name" onKeyDown={event => { if (event.key === 'Enter') setStep(1); }} /> : null}
      {step === 1 ? <div><BirthdayRow /><WeightRows instant /><HeightRow /><EstimateRows /></div> : null}
      {step === 2 ? <div><BalanceRows /><GoalRows /></div> : null}
      {error ? <p className={st.error} role="alert">{error}</p> : null}
      <div className={st.nav}>
        {step > 0 ? <button type="button" className={st.back} onClick={() => { setError(''); setStep(step - 1); }}>Back</button> : null}
        <button type="button" className={st.next} onClick={() => step < STEPS.length - 1 ? setStep(step + 1) : finish()}>{step < STEPS.length - 1 ? 'Continue' : 'Enter Santorio'}</button>
      </div>
    </section>
  </motion.div>;
}
