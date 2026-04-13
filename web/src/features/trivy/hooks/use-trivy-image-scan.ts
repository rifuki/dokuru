import { useMutation } from '@tanstack/react-query';

import { scanImage } from '../api/scan-image';

export function useTrivyImageScan() {
  return useMutation({
    mutationFn: (image: string) => scanImage(image),
  });
}
