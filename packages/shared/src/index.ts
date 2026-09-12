export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand }

export const MARKHERE_PRODUCT_NAME = 'MarkHere' as const
export const MARKHERE_BRIDGE_VERSION = 1 as const

export const MARKHERE_IDENTITY = Object.freeze({
  appId: 'com.markhere.desktop',
  executableName: 'markhere',
  userDataFolder: 'MarkHere',
  appProtocol: 'markhere',
  resourceProtocol: 'markhere-resource',
  ipcPrefix: 'mh:v1'
} as const)
