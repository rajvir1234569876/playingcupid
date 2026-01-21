import { motion } from "framer-motion";
interface HeartIconProps {
  className?: string;
  animate?: boolean;
}
export function HeartIcon({
  className = "",
  animate = false
}: HeartIconProps) {
  const heartVariants = {
    idle: {
      scale: 1
    },
    beat: {
      scale: [1, 1.15, 1, 1.1, 1],
      transition: {
        duration: 1.2,
        repeat: Infinity,
        repeatDelay: 0.5
      }
    }
  };
  return;
}