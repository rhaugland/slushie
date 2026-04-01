import { clsx } from "clsx";
import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2 text-sm",
        variant === "primary" &&
          "bg-blue-600 text-white hover:bg-blue-700",
        variant === "secondary" &&
          "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200",
        variant === "ghost" &&
          "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
        className
      )}
      {...props}
    />
  );
}
