import type { FunctionComponent } from "react";
import type { Block } from "../scene/Scene.tsx";
import { Appearance } from "./Appearance.tsx";
import { GitHub, GitHubMark } from "./GitHub.tsx";
import { Hero, HeroMark } from "./Hero.tsx";
import { Install, InstallMark } from "./Install.tsx";
import { Outline } from "./Outline.tsx";
import { Split } from "./Split.tsx";
import { Terminal, TerminalMark } from "./Terminal.tsx";
import { Unmark } from "./Unmark.tsx";

export interface SceneDefinition {
  id: string;
  block: Block;
  // Screens of scroll the scene owns while pinned; null for an ordinary block.
  length: number | null;
  Component: FunctionComponent;
  // The 3D mark behind the content (#195); only on navy, white, and blue sheets, where its pink and
  // coral stand out.
  Mark?: FunctionComponent;
}

// The page, top to bottom (#183). Each scene issue edits only its own component and stylesheet.
export const SCENES: SceneDefinition[] = [
  { id: "hero", block: "navy", length: 1, Component: Hero, Mark: HeroMark },
  { id: "unmark", block: "pink", length: 1.5, Component: Unmark },
  { id: "github", block: "white", length: 1.5, Component: GitHub, Mark: GitHubMark },
  { id: "split", block: "blue", length: 1, Component: Split },
  { id: "outline", block: "coral", length: 1, Component: Outline },
  { id: "terminal", block: "navy", length: 1, Component: Terminal, Mark: TerminalMark },
  { id: "appearance", block: "white", length: 1, Component: Appearance },
  { id: "install", block: "blue", length: null, Component: Install, Mark: InstallMark },
];
