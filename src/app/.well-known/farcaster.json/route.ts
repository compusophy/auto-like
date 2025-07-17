export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
  const frameName = process.env.NEXT_PUBLIC_FRAME_NAME || "compusophy";
  const iconRoute = process.env.NEXT_PUBLIC_ICON_ROUTE || "/icon.png";
  const imageRoute = process.env.NEXT_PUBLIC_IMAGE_ROUTE || "/image.png";
  const buttonTitle = process.env.NEXT_PUBLIC_BUTTON_TITLE || "launch";
  const splashRoute = process.env.NEXT_PUBLIC_SPLASH_ROUTE || "/splash.png";
  const splashBackground = process.env.NEXT_PUBLIC_SPLASH_BACKGROUND || "#000000";

  const config = {
    accountAssociation: {
    header: "eyJmaWQiOjM1MDkxMSwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDJGREVmM0Y0NzBlQ2QyQmM5YTk3NzU2OEM0M0FEMzg2MGMxNjExRDgifQ",
    payload: "eyJkb21haW4iOiJjb21wdS1jb21wdXNvcGh5LnZlcmNlbC5hcHAifQ",
    signature: "MHg4Y2IyMjRiNjkyNzZlYzkyZDA2MmJjMTZlMTQ4NGM0ZDFkZDBlODFlY2Q2NTAxNmQ3OGUxOWM2NTAxNTAyNGUwNjU4MGY2MzQ1NWI3MjY1OTQwMWFmMDI2M2E1OGNmZjcxZGEyYWU0ODA4ZWYzZWZiNzQyMzE0MjI0N2I0OTk0YzFj"
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