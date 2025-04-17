export type Prettify<T> = { [K in keyof T]: T[K] } & unknown

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

export type PascalCaseToCamelCase<S> = S extends `${infer T}${infer U}` ? `${Lowercase<T>}${U}` : S

export function pascalCaseToCamelCase<S extends string>(str: S): PascalCaseToCamelCase<S> {
  const firstChar = str.charAt(0).toLowerCase()
  const rest = str.slice(1)
  return `${firstChar}${rest}` as PascalCaseToCamelCase<S>
}
