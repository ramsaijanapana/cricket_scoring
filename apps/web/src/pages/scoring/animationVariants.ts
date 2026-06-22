export const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } },
};

export const ballBubbleVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 25, delay: i * 0.03 },
  }),
};

export const dismissalButtonVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 25, delay: i * 0.02 },
  }),
};
