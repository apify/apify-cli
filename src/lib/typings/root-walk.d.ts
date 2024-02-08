declare module '@root/walk' {
    const skipDir: Error;
    function walk(pathname: string, callback: (err: Error | null, pathname: string, dirent: Dirent) => void): Promise<void>;

    declare const rootWalk: {
        skipDir: typeof skipDir;
        walk: typeof walk;
    };

    export = rootWalk;
}
