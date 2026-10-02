// A small display adapter for model-produced plain-text equations, not a TeX engine.
const symbols={lambda:'λ',theta:'θ',alpha:'α',beta:'β',gamma:'γ',delta:'δ',Delta:'Δ',pi:'π',omega:'ω',Omega:'Ω',mu:'μ',rho:'ρ',sigma:'σ',epsilon:'ε',phi:'φ',tau:'τ',times:'×',cdot:'·',div:'÷',pm:'±',approx:'≈',neq:'≠',leq:'≤',geq:'≥',propto:'∝',rightarrow:'→',infty:'∞',degree:'°'};
const powers={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','n':'ⁿ','i':'ⁱ'};
const subscript={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋'};
const exponent=(value,map,fallback)=>[...value].every(ch=>map[ch])?[...value].map(ch=>map[ch]).join(''):fallback+'('+value+')';
const fractionPart=value=>/^[\p{L}\p{N}.]+$/u.test(value.trim())?value.trim():'('+value.trim()+')';
export function normalizeLessonText(text){
  let value=typeof text==='string'?text:'';
  value=value.replace(/\\\(|\\\)|\\\[|\\\]/g,'').replace(/\$\$([\s\S]*?)\$\$/g,'$1')
    .replace(/\$([^$\n]+)\$/g,(all,inside)=>/[=\\_^+*/<>]/.test(inside)||!inside.trim().includes(' ')?inside:all);
  value=value.replace(/\\(?:left|right)\b/g,'').replace(/\\(text|mathrm|mathbf|mathit)\s*\{([^{}]*)\}/g,'$2');
  value=value.replace(/\\([A-Za-z]+)\b/g,(all,key)=>symbols[key]||all);
  for(let i=0;i<6;i++){
    const next=value.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,(_,a,b)=>fractionPart(a)+'/'+fractionPart(b));
    if(next===value)break;value=next;
  }
  value=value.replace(/\^\s*(?:\{([^{}]+)\}|(-?\d+|[ni]))/g,(_,braced,plain)=>exponent(braced||plain,powers,'^'));
  value=value.replace(/_\s*(?:\{([^{}]+)\}|(\d+))/g,(_,braced,plain)=>exponent(braced||plain,subscript,'_'));
  value=value.replace(/\\(?:,|;|:|!)/g,' ').replace(/\\quad\b|\\qquad\b/g,' ');
  return value.replace(/[ \t]{2,}/g,' ').trim();
}
