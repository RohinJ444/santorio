export type Route = "home" | "workout" | "diet" | "settings";

export function routeOf(pathname: string): Route {
  if (pathname.startsWith("/workout")) return "workout";
  if (pathname.startsWith("/diet")) return "diet";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

export const PATHS: Record<Route, string> = {
  home: "/",
  workout: "/workout",
  diet: "/diet",
  settings: "/settings",
};
