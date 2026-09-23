interface CarbonIconDescriptor {
  attrs: Record<string, string | number>;
  content: Array<{
    attrs: Record<string, string | number>;
    elem: string;
  }>;
}

declare module "@carbon/icons/es/*/16.js" {
  const icon: CarbonIconDescriptor;

  export default icon;
}

declare module "@carbon/icons/es/*/20.js" {
  const icon: CarbonIconDescriptor;

  export default icon;
}

declare module "@carbon/icons/es/*/24.js" {
  const icon: CarbonIconDescriptor;

  export default icon;
}

declare module "@carbon/icons/es/*/32.js" {
  const icon: CarbonIconDescriptor;

  export default icon;
}
