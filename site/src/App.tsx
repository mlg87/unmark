import "@fontsource-variable/fredoka";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import { MotionConfig } from "motion/react";
import { Scene } from "./scene/Scene.tsx";
import { SCENES } from "./scenes/index.ts";
import { FloatingDownload } from "./ui/FloatingDownload.tsx";
import { Footer } from "./ui/Footer.tsx";
import { Header } from "./ui/Header.tsx";

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      {/* First in the tab order: a fixed element takes focus without scrolling, whereas tabbing
          to the header first would scroll the page back to the top and hide this button. */}
      <FloatingDownload />
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
