const EARTH_MASS_KG = 5.972e24

export const formatMass = (kg: string) => {
  const [mantissa, exponent] = Number(kg).toExponential(2).split('e')
  return `${mantissa} × 10^${Number(exponent)} kg`
}

export const toEarthMasses = (kg: string) => Number(kg) / EARTH_MASS_KG

export const formatEarthMasses = (value: number) =>
  value >= 10 ? value.toFixed(0) : value >= 1 ? value.toFixed(1) : value.toFixed(3)
