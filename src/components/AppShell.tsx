"use client";

/**
 * One persistent shell for the whole app. The 3D stage stays mounted across
 * routes so leaving home is a camera move, not a page swap; each route's
 * screen animates in over it. Route pages themselves render nothing.
 */
import { AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StoreProvider } from "@/lib/store";
import Greeting from "./home/Greeting";
import HomeOverlay from "./home/HomeOverlay";
import { routeOf } from "./routes";
import type { Part } from "./stage/Body";
import DietView from "./views/DietView";
import SettingsView from "./views/SettingsView";
import WorkoutView from "./views/WorkoutView";
import s from "./shell.module.css";

const Stage = dynamic(() => import("./stage/Stage"), { ssr: false });

const noop = () => () => {};

export default function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const route = routeOf(pathname);
  // Client-only: "today" and the mock data depend on the device clock.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  // The entrance plays only when the app opens on the body.
  const [intro] = useState(() => route === "home");

  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const onTap = useCallback(
    (part: Part) => {
      if (routeRef.current !== "home") return;
      if (part === "gut") router.push("/diet");
      else if (part === "body") router.push("/workout");
    },
    [router],
  );

  if (!mounted) return <div className={s.app} />;

  return (
    <StoreProvider>
      <div className={s.app}>
        <AnimatePresence>{route === "home" && <Greeting key="greeting" intro={intro} />}</AnimatePresence>
        <div className={s.stage} data-route={route}>
          <Stage route={route} intro={intro} onTap={onTap} />
        </div>
        <AnimatePresence>
          {route === "home" && <HomeOverlay key="home" intro={intro} />}
          {route === "workout" && <WorkoutView key="workout" />}
          {route === "diet" && <DietView key="diet" />}
          {route === "settings" && <SettingsView key="settings" />}
        </AnimatePresence>
      </div>
    </StoreProvider>
  );
}
