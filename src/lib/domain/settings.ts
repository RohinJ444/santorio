/** Date inputs can temporarily contain partial values while the user types. */
export function pastDateError(value:string,today:string,optional=false):string|null {
  if(!value)return optional?null:'Choose a date.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return 'Enter a complete, valid date.';
  return value>today?'Choose today or an earlier date.':null;
}

export function normalizedTimezone(value:string):string|null {
  const zone=value.trim();
  if(!zone||zone.length>100)return null;
  try {new Intl.DateTimeFormat('en-US',{timeZone:zone});return zone;}catch{return null;}
}
