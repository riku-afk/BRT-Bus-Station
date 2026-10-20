import * as React from 'react';
import { cn } from '@/lib/utils';

/** An on/off switch: a native checkbox (so it keeps its keyboard and screen-reader behaviour) drawn as a pill in the section colour. */
const Switch = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'type'> & { color?: string }>(({ className, color, style, ...props }, ref) => (
  <input ref={ref} type="checkbox" className={cn('sw', className)} style={{ ...style, ['--sw-on' as string]: color }} {...props} />
));
Switch.displayName = 'Switch';

export { Switch };
