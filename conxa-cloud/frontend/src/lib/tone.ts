/** Semantic status tone shared across dashboard/team/settings surfaces. */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Combined border/bg/text classes for a badge or pill. */
export function toneBadgeClasses(tone: Tone): string {
  if (tone === 'good') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
  if (tone === 'warn') return 'border-amber-500/25 bg-amber-500/10 text-amber-200'
  if (tone === 'bad') return 'border-red-500/25 bg-red-500/10 text-red-200'
  return 'border-white/10 bg-white/[0.04] text-zinc-300'
}

export type ToneStyle = { text: string; bg: string; border: string; icon: string }

/** Separated text/bg/border/icon classes for metric cells and health rows. */
export function toneStyle(tone: Tone): ToneStyle {
  if (tone === 'good') {
    return {
      text: 'text-emerald-300',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/25',
      icon: 'bg-emerald-500/10 text-emerald-300',
    }
  }
  if (tone === 'warn') {
    return {
      text: 'text-amber-300',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/25',
      icon: 'bg-amber-500/10 text-amber-300',
    }
  }
  if (tone === 'bad') {
    return {
      text: 'text-red-300',
      bg: 'bg-red-500/10',
      border: 'border-red-500/25',
      icon: 'bg-red-500/10 text-red-300',
    }
  }
  return {
    text: 'text-zinc-100',
    bg: 'bg-white/[0.035]',
    border: 'border-white/10',
    icon: 'bg-white/[0.05] text-zinc-400',
  }
}
