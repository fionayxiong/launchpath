import { useState } from "react";

export function useNumberInput(
  initialValue: number,
  options?: {
    min?: number;
    max?: number;
    normalizeOnBlur?: boolean;
  }
) {
  const { min, max, normalizeOnBlur = true } = options || {};

  const [text, setText] = useState<string>(String(initialValue));

  // 派生的 number 值（给计算用）
  let number = text === "" ? 0 : Number(text);
  if (Number.isNaN(number)) number = 0;

  if (typeof min === "number") number = Math.max(min, number);
  if (typeof max === "number") number = Math.min(max, number);

  return {
    text,
    number,
    inputProps: {
      type: "number",
      value: text,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
      },
      onBlur: normalizeOnBlur
        ? () => {
            setText(String(number));
          }
        : undefined,
    },
  };
}
