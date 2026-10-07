/** Start a file download from a url. The server answers with Content-Disposition: attachment, so the page stays put. */
export function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
