export const getLogoUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  
  // If it's already a relative path or local, don't proxy
  if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  
  // Proxy all external URLs to bypass hotlinking and CORS issues
  return `/api/channels/logo-proxy?url=${encodeURIComponent(url)}`;
};
