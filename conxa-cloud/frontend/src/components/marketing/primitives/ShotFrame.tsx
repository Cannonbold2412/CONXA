import Image from 'next/image'

interface ShotFrameProps {
  src?: string
  alt: string
  label: string
  className?: string
}

/** Browser-chrome framed panel for real product screenshots.
 *  Renders a quiet placeholder until the screenshot file exists. */
export function ShotFrame({ src, alt, label, className }: ShotFrameProps) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/6 bg-[#0b0f14] ${className ?? ''}`}>
      <div className="flex items-center gap-1.5 border-b border-white/6 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="h-2 w-2 rounded-full bg-white/10" />
        <span className="ml-3 text-[11px] text-[#6b7280]">{label}</span>
      </div>
      <div className={`relative w-full ${src ? 'aspect-[16/9]' : 'aspect-[16/5]'}`}>
        {src ? (
          <Image src={src} alt={alt} fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover object-top" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0f1620]">
            <span className="text-xs text-[#9ba3af]">{label}</span>
          </div>
        )}
      </div>
    </div>
  )
}
