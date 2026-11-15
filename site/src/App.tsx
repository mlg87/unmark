import "@fontsource-variable/fredoka";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import { MotionConfig } from "motion/react";
import { Scene } from "./scene/Scene.tsx";
import { SCENES } from "./scenes/index.ts";
import { Footer } from "./ui/Footer.tsx";
import { Header } from "./ui/Header.tsx";

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Header />
      <main>
        {SCENES.map(({ id, block, length, Component }, index) => (
          <Scene key={id} id={id} block={block} length={length} index={index}>
            <Component />
          </Scene>
        ))}
      </main>
      <Footer />
    </MotionConfig>
  );
}
