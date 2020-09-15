export function staticImplements<T>() {
  return <U extends T>(constructor: U) => {constructor};
}

export async function sleep(millis: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, millis));
}
