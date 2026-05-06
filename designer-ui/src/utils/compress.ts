export function compressImage(file: File, maxSide = 1800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width > height) { height = Math.round(height * maxSide / width); width = maxSide; }
          else { width = Math.round(width * maxSide / height); height = maxSide; }
        }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
