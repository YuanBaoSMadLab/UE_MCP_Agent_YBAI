// 扩展 process 类型以支持 pkg 打包环境
declare global {
  namespace NodeJS {
    interface Process {
      pkg?: {
        entrypoint: string;
      };
    }
  }
}

export {};
