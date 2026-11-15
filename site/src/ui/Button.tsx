import type { AnchorHTMLAttributes } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: "primary" | "solid";
  size?: "regular" | "small";
}

export function Button({
  variant = "primary",
  size = "regular",
  className,
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className].filter(Boolean);
  return <a className={classes.join(" ")} {...props} />;
}
