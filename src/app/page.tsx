import { Metadata } from "next";
import App from "./app";

const appUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
const frameName = process.env.NEXT_PUBLIC_FRAME_NAME || "compusophy signer";
const imageRoute = process.env.NEXT_PUBLIC_IMAGE_ROUTE || "/image.png";
const buttonTitle = process.env.NEXT_PUBLIC_BUTTON_TITLE || "launch";
const splashRoute = process.env.NEXT_PUBLIC_SPLASH_ROUTE || "/splash.png";
const splashBackground = process.env.NEXT_PUBLIC_SPLASH_BACKGROUND || "#000000";

const frame = {
  version: "next",
  imageUrl: `${appUrl}${imageRoute}`,
  button: {
    title: buttonTitle,
    action: {
      type: "launch_frame",
      name: frameName,
      url: appUrl,
      splashImageUrl: `${appUrl}${splashRoute}`,
      splashBackgroundColor: splashBackground,
    },
  },
};

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: frameName,
    openGraph: {
      title: frameName,
      description: `A ${frameName} app.`,
    },
    other: {
      "fc:frame": JSON.stringify(frame),
    },
  };
}

export default function Home() {
  return <App />;
}
