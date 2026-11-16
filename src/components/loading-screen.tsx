import Image from "next/image";

const brandImage = "/image_6c70d8.jpg";

export function LoadingScreen() {
  return (
    <div className="loader-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="loader-content">
        <div className="loader-mark"><span className="loader-ring" /><Image className="loader-logo" src={brandImage} width={70} height={70} alt="" unoptimized /></div>
        <strong>Home Made Food</strong>
        <span className="loader-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="loader-caption">Preparing your page...</span>
      </div>
    </div>
  );
}
