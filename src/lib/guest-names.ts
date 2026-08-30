export function capitalizeNameInitial(value: string) {
  return value.replace(/\p{L}/u, (character) => character.toLocaleUpperCase());
}
