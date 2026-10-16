"use client";

/**
 * One persistent shell for the whole app. The 3D stage stays mounted across
 * routes so leaving home is a camera move, not a page swap; each route's
 * screen animates in over it. Route pages themselves render nothing.
 */
import { AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { DataProvider, useData } from "@/lib/data-store";
import AuthGate from "./prototype/AuthGate";
import ConsentScreen from "./prototype/ConsentScreen";
import ResetPasswordScreen from "./prototype/ResetPasswordScreen";
import Onboarding from "./prototype/Onboarding";
import Greeting from "./home/Greeting";
import HomeOverlay from "./home/HomeOverlay";
import { routeOf } from "./routes";

import s from "./shell.module.css";

const DietView = dynamic(() => import("./prototype/NutritionScreen"));
const SettingsView = dynamic(() => import("./prototype/SettingsScreen"));
const WorkoutView = dynamic(() => import("./prototype/WorkoutScreen"));
const Stage = dynamic(() => import("./stage/Stage"), { ssr: false });

const noop = () => () => {};

function VisualShell() {
  const { profile } = useData();
  const pathname = usePathname();
  const route = routeOf(pathname);
  // Date formatting and the 3D introduction begin after hydration.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  // The entrance plays only when the app opens on the body (or comes to it from onboarding).
  const [intro] = useState(() => route === "home" || !profile.onboardingComplete);
  // Development only: /?onboarding=preview replays first run on an existing profile.
  const [preview, setPreview] = useState(() => process.env.NODE_ENV === "development" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("onboarding") === "preview");

  if (!mounted) return <div className={s.app} />;

  const onboarding = !profile.onboardingComplete || preview;
  const stage = onboarding ? "onboarding" : route;

  return (
      <div className={s.app}>
        <AnimatePresence>{stage === "home" && <Greeting key="greeting" intro={intro} />}</AnimatePresence>
        <div className={s.stage} data-route={stage}>
          <Stage route={stage} intro={intro} />
        </div>
        <AnimatePresence>
          {onboarding && <Onboarding key="onboarding" onDone={() => setPreview(false)} />}
          {stage === "home" && <HomeOverlay key="home" intro={intro} />}
          {stage === "workout" && <WorkoutView key="workout" />}
          {stage === "diet" && <DietView key="diet" />}
          {stage === "settings" && <SettingsView key="settings" />}
        </AnimatePresence>
      </div>
  );
}

export default function AppShell() {
  const pathname=usePathname();
  if(pathname === "/reset-password") return <ResetPasswordScreen/>;
  return <AuthGate>{(user,reset)=>pathname.startsWith('/oauth/consent') ? <ConsentScreen/> : <DataProvider user={user} onSignOut={reset}><VisualShell/></DataProvider>}</AuthGate>;
}
