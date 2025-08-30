export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
  const frameName = process.env.NEXT_PUBLIC_FRAME_NAME || "auto-like";
  const iconRoute = process.env.NEXT_PUBLIC_ICON_ROUTE || "/icon.png";
  const imageRoute = process.env.NEXT_PUBLIC_IMAGE_ROUTE || "/image.png";
  const buttonTitle = process.env.NEXT_PUBLIC_BUTTON_TITLE || "launch";
  const splashRoute = process.env.NEXT_PUBLIC_SPLASH_ROUTE || "/splash.png";
  const splashBackground = process.env.NEXT_PUBLIC_SPLASH_BACKGROUND || "#000000";

  const config = {
    "accountAssociation": {
    "header": "eyJmaWQiOjM1MDkxMSwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDJGREVmM0Y0NzBlQ2QyQmM5YTk3NzU2OEM0M0FEMzg2MGMxNjExRDgifQ",
    "payload": "eyJkb21haW4iOiJjb21wdS1hdXRvLWxpa2UudmVyY2VsLmFwcCJ9",
    "signature": "MHhiMWU3ODEwY2Q2NGM4MDY3MmE1ZGQzOWFjNmYxYjQzYjA0YmQwMTVjZDdjZGQwODI5MTY0MjkyYjQ3NzAyMTFjNTJmYzcwNDczMjY1ZDNmYzdkOGNlOTQ4MGZjYzE4Mzc4ZGE4NTMxYzFhZTYzNmQ0ZDQ4NDFjMDY1NGE2MTJkYjFi"
  },
    frame: {
      version: "1",
      name: frameName,
      iconUrl: `${appUrl}${iconRoute}`,
      homeUrl: `${appUrl}`,
      imageUrl: `${appUrl}${imageRoute}`,
      buttonTitle: buttonTitle,
      splashImageUrl: `${appUrl}${splashRoute}`,
      splashBackgroundColor: splashBackground,
    },
  };

  return Response.json(config);
} 