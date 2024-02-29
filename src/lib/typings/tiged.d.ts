declare module 'tiged' {
    declare class Tiged {
        // https://www.youtube.com/watch?v=Dm5Uvwlpb0g
        clone(destinationUnknown: string): Promise<void>;
    }

    function tiged(url: string): Tiged;

    export = tiged;
}
