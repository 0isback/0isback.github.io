export const deg2rad = d => d * Math.PI / 180;
export const rad2deg = r => r * 180 / Math.PI;

export function solarDeclinationRadByMonth(m, MIDDAY_OF_MONTH){
  const N = MIDDAY_OF_MONTH[m - 1];
  return deg2rad(23.44) * Math.sin(2 * Math.PI * ((N - 80) / 365));
}

export function getSeason(month){
  if ([3,4,5].includes(month))   return '봄';
  if ([6,7,8].includes(month))   return '여름';
  if ([9,10,11].includes(month)) return '가을';
  return '겨울';
}
export const toHHMM = (t)=>{
  const h = Math.floor(t);
  const m = Math.floor((t - h) * 60 + 1e-6);
  return `${String(h).padStart(2,'0')}시 ${String(m).padStart(2,'0')}분`;
};
export const fmtDeg = (rad)=> {
  const d = rad2deg(rad);
  return (d>=0?'+':'') + d.toFixed(2) + '도';
};