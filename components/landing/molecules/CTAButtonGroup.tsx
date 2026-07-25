import { ArrowRight, Mic, Play } from "lucide-react";
import { ActionLink } from "../atoms/ActionLink";

type CTAButtonGroupProps = {
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  secondaryIcon?: "play" | "none";
};

export function CTAButtonGroup({ primaryHref, primaryLabel, secondaryHref, secondaryLabel, secondaryIcon = "none" }: CTAButtonGroupProps) {
  return (
    <div className="cta-button-group">
      <ActionLink href={primaryHref}>
        <Mic aria-hidden="true" size={18} />
        {primaryLabel}
        <ArrowRight aria-hidden="true" className="cta-arrow" size={17} />
      </ActionLink>
      <ActionLink href={secondaryHref} variant="secondary">
        {secondaryIcon === "play" ? <Play aria-hidden="true" size={16} fill="currentColor" /> : null}
        {secondaryLabel}
      </ActionLink>
    </div>
  );
}
