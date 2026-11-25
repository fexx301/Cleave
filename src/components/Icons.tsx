// Official Cleave SVG lockup + custom geometric inline SVGs (zero emojis, zero generic icon packs)

export function CleaveLogo({ height = 28 }: { height?: number }) {
  const width = Math.round((123 / 32) * height);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 123 32"
      role="img"
      aria-label="Cleave"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="cleave-ink-ui" x1="80" y1="570" x2="551" y2="175" gradientUnits="userSpaceOnUse">
          <stop stopColor="#246B4D" />
          <stop offset=".5" stopColor="#247772" />
          <stop offset="1" stopColor="#327DB3" />
        </linearGradient>
      </defs>
      <g fill="url(#cleave-ink-ui)" transform="translate(-2.93 -2.18) scale(.049)">
        <path d="M86 425C70 334 93 245 156 180C219 114 306 85 392 86C495 87 578 131 576 211C575 269 531 305 476 305C445 305 416 294 400 275Z" />
        <path d="M93 455L330 350C303 391 307 438 336 465C366 493 412 491 451 472C476 460 494 452 518 454C553 457 576 483 576 518C576 592 490 655 372 656C239 657 127 577 93 455Z" />
      </g>
      <path
        fill="#171816"
        d="M55.34 18.684 L56.04 18.684 L56.04 26.41 L55.34 26.41 Q55.047 25.093 54.283 24.084 Q51.371 27.37 46.849 27.37 Q42.067 27.37 39.034 24.344 Q36 21.319 36 16.342 Q36 13.072 37.399 10.185 Q38.798 7.298 41.303 5.899 Q43.808 4.5 46.801 4.5 Q49.273 4.5 51.282 5.517 Q53.291 6.533 54.283 7.769 Q54.982 6.387 55.129 4.907 L55.844 4.907 L56.04 13.267 L55.34 13.267 Q54.608 8.81 52.355 7.07 Q50.103 5.33 47.272 5.33 Q43.808 5.33 41.766 8.144 Q39.725 10.958 39.725 16.195 Q39.725 21.156 41.953 23.8 Q44.182 26.443 47.5 26.443 Q49.273 26.443 51.127 25.581 Q52.982 24.719 54.063 22.661 Q55.145 20.603 55.34 18.684 Z M62.993 4.598 L62.993 22.393 Q62.993 24.523 63.05 25.076 Q63.107 25.629 63.514 25.922 Q63.92 26.215 64.961 26.215 L65.352 26.215 L65.352 26.963 L58.227 26.963 L58.227 26.215 L58.683 26.215 Q59.659 26.215 60.073 25.947 Q60.488 25.678 60.57 25.19 Q60.651 24.702 60.651 22.393 L60.651 9.217 Q60.651 7.119 60.277 6.574 Q59.903 6.029 58.455 6.029 L58.455 5.281 Q59.447 5.281 60.789 5.053 Q62.131 4.825 62.635 4.598 Z M78.828 18.147 L69.54 18.147 Q69.475 19.107 69.475 19.579 Q69.475 23.092 70.573 24.857 Q71.671 26.622 73.851 26.622 Q76.811 26.622 78.047 23.97 L78.828 23.97 Q78.308 25.629 76.762 26.565 Q75.217 27.5 73.395 27.5 Q71.704 27.5 70.199 26.646 Q68.694 25.792 67.735 24.231 Q66.775 22.669 66.775 20.441 Q66.775 17.285 68.629 15.195 Q70.484 13.105 73.265 13.105 Q75.884 13.105 77.315 14.699 Q78.747 16.293 78.828 18.147 Z M75.981 17.496 Q76.03 17.122 76.03 16.83 Q76.03 15.398 75.193 14.609 Q74.355 13.82 73.135 13.82 Q70.175 13.82 69.605 17.496 Z M94.419 24.523 L95.021 24.523 Q94.874 27.305 92.288 27.305 Q91.182 27.305 90.539 26.719 Q89.897 26.134 89.702 24.979 Q88.075 26.134 86.733 26.719 Q85.391 27.305 84.334 27.305 Q82.984 27.305 82.008 26.524 Q81.032 25.743 81.032 24.458 Q81.032 22.783 82.667 21.53 Q84.301 20.278 87.18 19.091 L89.702 18.066 L89.702 17.415 Q89.702 16.033 89.523 15.414 Q89.344 14.796 88.596 14.308 Q87.847 13.82 86.627 13.82 Q84.188 13.82 83.911 15.447 Q83.651 17.106 82.545 17.106 Q81.552 17.106 81.552 16.163 Q81.552 15.236 82.87 14.17 Q84.188 13.105 86.969 13.105 Q89.035 13.105 90.173 13.755 Q91.312 14.406 91.678 15.236 Q92.044 16.065 92.044 17.773 L92.044 23.157 Q92.044 25.044 92.239 25.581 Q92.434 26.117 93.085 26.117 Q94.159 26.117 94.419 24.523 Z M89.702 18.83 L87.929 19.546 Q83.732 21.254 83.732 23.84 Q83.732 24.865 84.269 25.491 Q84.806 26.117 85.668 26.117 Q86.432 26.117 87.441 25.613 Q88.449 25.109 89.702 24.1 Z M102.137 27.5 L101.194 27.5 L96.46 16.813 Q95.761 15.268 95.354 14.845 Q94.947 14.422 94.02 14.39 L94.02 13.641 L100.039 13.641 L100.039 14.39 Q99.046 14.39 98.68 14.552 Q98.314 14.715 98.314 15.17 Q98.314 15.528 98.965 16.911 L102.56 24.995 L105.797 17.789 Q106.561 16.065 106.561 15.545 Q106.561 14.455 104.935 14.39 L104.935 13.641 L109.424 13.641 L109.424 14.39 Q108.595 14.438 108.033 15.081 Q107.472 15.723 106.464 17.968 Z M121.648 18.147 L112.36 18.147 Q112.295 19.107 112.295 19.579 Q112.295 23.092 113.393 24.857 Q114.491 26.622 116.67 26.622 Q119.631 26.622 120.867 23.97 L121.648 23.97 Q121.127 25.629 119.582 26.565 Q118.037 27.5 116.215 27.5 Q114.523 27.5 113.019 26.646 Q111.514 25.792 110.554 24.231 Q109.595 22.669 109.595 20.441 Q109.595 17.285 111.449 15.195 Q113.303 13.105 116.085 13.105 Q118.704 13.105 120.135 14.699 Q121.567 16.293 121.648 18.147 Z M118.801 17.496 Q118.85 17.122 118.85 16.83 Q118.85 15.398 118.012 14.609 Q117.175 13.82 115.955 13.82 Q112.994 13.82 112.425 17.496 Z"
      />
    </svg>
  );
}

export function DeviceLockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CloudSplitIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 12h7.25a2.75 2.75 0 0 0 .35-5.48A4 4 0 0 0 4.3 5.7 2.5 2.5 0 0 0 4.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocumentUploadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 10.5V3.5M8 3.5 5 6.5M8 3.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SeamScissorsIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v12M4.5 5.5 8 8l3.5-2.5M4.5 10.5 8 8l3.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.25 6.25 8 10l3.75-3.75" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
