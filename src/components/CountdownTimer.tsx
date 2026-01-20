import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface CountdownTimerProps {
  targetTime: Date;
  onComplete?: () => void;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

export function CountdownTimer({ targetTime, onComplete }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ hours: 0, minutes: 0, seconds: 0 });
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = targetTime.getTime();
      const difference = target - now;

      if (difference <= 0) {
        setIsComplete(true);
        onComplete?.();
        return { hours: 0, minutes: 0, seconds: 0 };
      }

      return {
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / (1000 * 60)) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime, onComplete]);

  const TimeBlock = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <motion.div
        key={value}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        className="w-20 h-24 sm:w-24 sm:h-28 bg-card border border-border/50 rounded-xl flex items-center justify-center shadow-card"
      >
        <span className="font-display text-4xl sm:text-5xl font-bold text-primary">
          {value.toString().padStart(2, "0")}
        </span>
      </motion.div>
      <span className="text-sm text-muted-foreground mt-2 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );

  if (isComplete) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center"
      >
        <p className="text-2xl text-champagne font-display animate-pulse-soft">
          It's time! ✨
        </p>
      </motion.div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <TimeBlock value={timeLeft.hours} label="Hours" />
      <span className="text-3xl text-primary font-bold animate-pulse">:</span>
      <TimeBlock value={timeLeft.minutes} label="Minutes" />
      <span className="text-3xl text-primary font-bold animate-pulse">:</span>
      <TimeBlock value={timeLeft.seconds} label="Seconds" />
    </div>
  );
}
