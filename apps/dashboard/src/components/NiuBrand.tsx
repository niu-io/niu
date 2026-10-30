import geometry from '../../../../branding/rounded/sources/mark-paths.json';
import lettering from '../../../../branding/rounded/sources/lettering.json';
import { palette } from '../../../../branding/rounded/manifest.json';
import '../../../../branding/identity.css';

/** Niu artwork only. Parent links provide the accessible name and destination. */
export default function NiuBrand({ variant = 'lockup', locale, className = '' }: {
  variant?: 'lockup' | 'mark'; locale?: 'en' | 'zh-CN'; className?: string;
}) {
  const colors = [palette.gold, palette.amber, palette.tangerine, palette.orange, palette.coral, palette.salmon, palette.marigold];
  const mark = <g transform={`scale(${128 / geometry.viewBox[2]})`}>{geometry.blades.map((d, i) => <path key={i} d={d} fill={colors[i]} />)}</g>;
  if (variant === 'mark') return <span className={`niu-brand niu-brand-mark ${className}`} aria-hidden="true"><svg viewBox="0 0 128 128" focusable="false">{mark}</svg></span>;
  return <span className={`niu-brand ${className}`} data-brand-locale={locale ?? 'auto'} aria-hidden="true">
    {(['en', 'zh-CN'] as const).filter(language => !locale || locale === language).map(language => <svg key={language} data-brand-language={language} viewBox={`0 0 ${language === 'en' ? 312 : 506} 128`} focusable="false">
      {mark}
      <g transform={`translate(${lettering.lockupPlacement.x} ${lettering.lockupPlacement.y}) scale(${lettering.lockupPlacement.scale})`} fill="currentColor">
        {lettering.latin.map(glyph => <path key={glyph.character} d={glyph.path} />)}
        {language === 'zh-CN' && <g transform={`translate(${lettering.chineseOffset.x} ${lettering.chineseOffset.y})`} stroke="currentColor" strokeWidth={lettering.chineseStrokeWidth} strokeLinejoin="round">{lettering.chinese.map(glyph => <path key={glyph.character} d={glyph.path} />)}</g>}
      </g>
    </svg>)}
  </span>;
}
