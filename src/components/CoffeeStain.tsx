/**
 * The ring an espresso cup left on the felt: an uneven dried edge, a fainter second ring where the cup was
 * put down again, and a few drips. SVG noise filters roughen the shapes so they read as soaked into cloth.
 */
export function CoffeeStain() {
  return (
    <svg className="coffee-stain" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <filter id="stain-dry" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="7" xChannelSelector="R" yChannelSelector="G" result="shape" />
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="11" result="blotch" />
          <feColorMatrix in="blotch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.3 0.15" result="patchy" />
          <feComposite in="shape" in2="patchy" operator="in" />
        </filter>
        <filter id="stain-wash" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" result="shape" />
          <feGaussianBlur in="shape" stdDeviation="1.6" />
        </filter>
        <filter id="stain-edge" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="2" seed="5" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g fill="none" stroke="currentColor">
        <circle cx="96" cy="100" r="60" fill="currentColor" fillOpacity="0.08" stroke="none" filter="url(#stain-wash)" />
        <circle cx="96" cy="100" r="62" strokeWidth="10" strokeOpacity="0.14" filter="url(#stain-wash)" />
        <circle cx="96" cy="100" r="64.5" strokeWidth="3.4" strokeOpacity="0.6" filter="url(#stain-dry)" />
        <circle cx="96" cy="100" r="62.5" strokeWidth="1.4" strokeOpacity="0.35" strokeDasharray="120 40 90 60" filter="url(#stain-dry)" />
        <circle cx="113" cy="87" r="61" strokeWidth="2.6" strokeOpacity="0.38" strokeDasharray="170 400" strokeDashoffset="-30" filter="url(#stain-dry)" />
        <circle cx="113" cy="87" r="58" strokeWidth="8" strokeOpacity="0.07" strokeDasharray="170 400" strokeDashoffset="-30" filter="url(#stain-wash)" />
      </g>
      <g fill="currentColor" filter="url(#stain-edge)">
        <circle cx="167" cy="134" r="4.5" fillOpacity="0.4" />
        <circle cx="176" cy="145" r="2.2" fillOpacity="0.35" />
        <circle cx="159" cy="147" r="1.6" fillOpacity="0.35" />
        <circle cx="183" cy="128" r="1.2" fillOpacity="0.3" />
        <ellipse cx="35" cy="62" rx="3.2" ry="2.2" fillOpacity="0.3" />
      </g>
    </svg>
  );
}
