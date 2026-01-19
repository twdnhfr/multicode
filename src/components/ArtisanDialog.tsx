import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";

export type ArtisanAction = "migrate" | "migrate:fresh" | "migrate:fresh --seed";

interface ArtisanDialogProps {
  onSelect: (action: ArtisanAction) => void;
  onCancel: () => void;
}

const OPTIONS: { label: string; value: ArtisanAction }[] = [
  { label: "php artisan migrate", value: "migrate" },
  { label: "php artisan migrate:fresh", value: "migrate:fresh" },
  { label: "php artisan migrate:fresh --seed", value: "migrate:fresh --seed" },
];

export function ArtisanDialog({ onSelect, onCancel }: ArtisanDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel();
      return;
    }
    if (key.name === "1" || key.name === "2" || key.name === "3") {
      const index = Number.parseInt(key.name, 10) - 1;
      const option = OPTIONS[index];
      if (option) onSelect(option.value);
      return;
    }
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(OPTIONS.length - 1, i + 1));
      return;
    }
    if (key.name === "return") {
      const option = OPTIONS[selectedIndex];
      if (option) onSelect(option.value);
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box justifyContent="center" paddingBottom={1}>
        <text attributes={TextAttributes.BOLD}>Laravel Migrations</text>
      </box>
      <box flexDirection="column">
        {OPTIONS.map((option, index) => (
          <text
            key={option.value}
            attributes={index === selectedIndex ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
          >
            {index === selectedIndex ? "▶ " : "  "}
            {index + 1}.{" "}
            {option.label}
          </text>
        ))}
      </box>
      <box paddingTop={1}>
        <text attributes={TextAttributes.DIM}>[1-3] Run  [Enter] Run  [Esc] Cancel</text>
      </box>
    </box>
  );
}
