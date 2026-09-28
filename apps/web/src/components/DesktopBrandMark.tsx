import ckcodeIconUrl from "../../../desktop/resources/branding/ckcode-renderer.png";

export function DesktopBrandMark({ className }: { readonly className?: string }) {
  return <img src={ckcodeIconUrl} alt="" className={className} aria-hidden />;
}
