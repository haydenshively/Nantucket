export default interface Fetchable {
  fetch(withConfig): Promise<any>;
}