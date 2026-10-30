import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export type WithElementRef<T, E extends HTMLElement = HTMLElement> = T & { ref?: E | null };
