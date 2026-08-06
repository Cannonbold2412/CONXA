'use client'

import { useState } from 'react'
import { SectionHeader } from '../primitives/SectionHeader'
import { Reveal } from '../primitives/Reveal'

/** YouTube video ID for the product demo (the part after v= in the URL). */
const VIDEO_ID = 'nEj-gwiva2A'

export function DemoStory() {
  const [playing, setPlaying] = useState(false)

  return (
    <section id="demo" className="relative bg-[#06080b] px-6 py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          headline="From a sentence to a finished task."
          sub="Watch a real run: a plain-language request, the right skill, and the software doing the work."
        />

        <Reveal className="mt-14">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/6 bg-[#0b0f14]">
            {playing && VIDEO_ID ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
                title="Conxa product demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            ) : (
              <button
                type="button"
                onClick={() => VIDEO_ID && setPlaying(true)}
                disabled={!VIDEO_ID}
                aria-label={VIDEO_ID ? 'Play the Conxa product demo video' : 'Demo video coming soon'}
                className="group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 disabled:cursor-default"
                style={
                  VIDEO_ID
                    ? { backgroundImage: `url(https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : undefined
                }
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#06080b]/80 backdrop-blur transition-transform group-hover:scale-105 group-disabled:opacity-50">
                  <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 text-[#22d3ee]" fill="currentColor" aria-hidden>
                    <path d="M8 5.5v13l11-6.5-11-6.5z" />
                  </svg>
                </span>
                <span className="text-sm text-[#9ba3af]">{VIDEO_ID ? 'Watch the demo' : 'Demo video — coming soon'}</span>
              </button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
