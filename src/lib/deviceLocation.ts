/** Fresh coordinates only: retry indoor GPS timeouts using the browser's
 * standard location provider. The server still enforces restaurant distance. */
export async function locateDevice(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
): Promise<GeolocationPosition> {
  const request = (enableHighAccuracy: boolean, timeout: number) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      // Some embedded browsers fail to invoke either callback on timeout.
      const timer = setTimeout(() => reject({code: 3}), timeout + 1000);
      const succeed = (position: GeolocationPosition) => {
        clearTimeout(timer);
        resolve(position);
      };
      const fail = (error: GeolocationPositionError) => {
        clearTimeout(timer);
        reject(error);
      };
      try {
        geolocation.getCurrentPosition(succeed, fail, {
          enableHighAccuracy, timeout, maximumAge: 0,
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  try {
    return await request(true, 12000);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    // Permission denial needs action in phone/browser settings, not a retry.
    if (code !== 2 && code !== 3) throw error;
    return request(false, 10000);
  }
}
