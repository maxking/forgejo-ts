export interface Tag {
    name: string;
    id: string;
    message: string;
    commit: {
        sha: string;
        url: string;
    };
    zipball_url: string;
    tarball_url: string;
}
export interface CreateTagOptions {
    tag_name: string;
    target: string;
    message?: string;
}
//# sourceMappingURL=tag.d.ts.map