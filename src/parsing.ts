import {MarkdownNode} from './ast';

export function parse(markdown: string): MarkdownNode {
    return MarkdownParser.parse(markdown);
}

class MismatchError extends Error {
    public constructor() {
        super('Mismatched token');

        Object.setPrototypeOf(this, MismatchError.prototype);
    }
}

class MarkdownParser {
    private readonly chars: string[];

    private index = 0;

    private static readonly NEWLINE = ['\r\n', '\r', '\n'];

    private static readonly NEW_PARAGRAPH = MarkdownParser.NEWLINE
        .flatMap(prefix => MarkdownParser.NEWLINE.map(suffix => prefix + suffix));

    private constructor(input: string) {
        this.chars = [...input];
    }

    public static parse(input: string): MarkdownNode {
        return new MarkdownParser(input).parseNext();
    }

    private parseNext(end: string = ''): MarkdownNode {
        const root: MarkdownNode<'fragment'> = {
            type: 'fragment',
            children: [],
        };

        let text = '';

        while (!this.done) {
            const escapedText = this.parseText('');

            if (escapedText !== '') {
                text += escapedText;

                continue;
            }

            if (end !== '' && (this.matches(end) || this.matches(...MarkdownParser.NEWLINE))) {
                break;
            }

            if (this.matches(...MarkdownParser.NEW_PARAGRAPH)) {
                while (MarkdownParser.NEWLINE.includes(this.current)) {
                    this.advance();
                }

                if (text !== '' || root.children.length > 0) {
                    let paragraph: MarkdownNode = root.children[root.children.length - 1];

                    if (paragraph?.type !== 'paragraph') {
                        paragraph = {
                            type: 'paragraph',
                            children: root.children,
                        };

                        root.children = [paragraph];
                    }

                    if (text !== '') {
                        paragraph.children.push({
                            type: 'text',
                            content: text,
                        });

                        text = '';
                    }

                    root.children.push({
                        type: 'paragraph',
                        children: [],
                    });
                }

                continue;
            }

            const {index} = this;

            let node: MarkdownNode|null = null;

            try {
                node = this.parseCurrent();
            } catch (error) {
                if (!(error instanceof MismatchError)) {
                    /* istanbul ignore next */
                    throw error;
                }
            }

            if (node === null) {
                this.seek(index);

                text += this.current;

                this.advance();

                continue;
            }

            let parent = root.children[root.children.length - 1];

            if (parent?.type !== 'paragraph') {
                parent = root;
            }

            if (text !== '') {
                parent.children.push({
                    type: 'text',
                    content: text,
                });
            }

            text = '';

            parent.children.push(node);
        }

        if (text !== '') {
            let parent = root.children[root.children.length - 1];

            if (parent?.type !== 'paragraph') {
                parent = root;
            }

            parent.children.push({
                type: 'text',
                content: text,
            });
        }

        const lastNode = root.children[root.children.length - 1];

        if (lastNode?.type === 'paragraph' && lastNode.children.length === 0) {
            root.children.pop();
        }

        if (root.children.length === 1) {
            return root.children[0];
        }

        return root;
    }

    private parseCurrent(): MarkdownNode|null {
        const char = this.lookAhead();

        switch (char) {
            case '*':
            case '_': {
                const delimiter = this.matches('**') ? '**' : char;

                this.advance(delimiter.length);

                const children = this.parseNext(delimiter);

                this.match(delimiter);

                return {
                    type: delimiter.length === 1 ? 'italic' : 'bold',
                    children: children,
                };
            }

            case '~': {
                this.match('~~');

                const children = this.parseNext('~~');

                this.match('~~');

                return {
                    type: 'strike',
                    children: children,
                };
            }

            case '`': {
                if (this.matches('```')) {
                    return null;
                }

                const delimiter = this.matches('``') ? '``' : '`';

                this.match(delimiter);

                const content = this.parseText(delimiter).trim();

                if (this.matches('```')) {
                    return null;
                }

                this.match(delimiter);

                return {
                    type: 'code',
                    content: content,
                };
            }

            case '!': {
                this.advance();

                this.match('[');

                const alt = this.parseText(']');

                this.match('](');

                const src = this.parseText(')');

                this.match(')');

                return {
                    type: 'image',
                    src: src,
                    alt: alt,
                };
            }

            case '[': {
                this.advance();

                const label = this.parseNext(']');

                this.match('](');

                const href = this.parseText(')');

                this.match(')');

                return {
                    type: 'link',
                    href: href,
                    children: label,
                };
            }

            default:
                return null;
        }
    }

    private parseText(end: string): string {
        let text = '';

        while (!this.done) {
            if (this.current === '\\' && this.index + 1 < this.length) {
                this.advance();

                text += this.current;

                this.advance();

                continue;
            }

            if (end === '' || this.matches(end) || this.matches(...MarkdownParser.NEWLINE)) {
                break;
            }

            text += this.current;

            this.advance();
        }

        return text;
    }

    private get done(): boolean {
        return this.index >= this.length;
    }

    private get length(): number {
        return this.chars.length;
    }

    private get current(): string {
        return this.chars[this.index];
    }

    private advance(length: number = 1): void {
        this.index += length;
    }

    private seek(index: number): void {
        this.index = index;
    }

    private matches(...lookahead: string[]): boolean {
        return lookahead.some(substring => this.lookAhead(substring.length) === substring);
    }

    private match(...lookahead: string[]): void {
        for (const substring of lookahead) {
            if (this.lookAhead(substring.length) === substring) {
                this.advance(substring.length);

                return;
            }
        }

        throw new MismatchError();
    }

    private lookAhead(length: number = 1): string {
        if (length === 1) {
            return this.current;
        }

        return this.getSlice(this.index, this.index + length);
    }

    private getSlice(start: number, end: number): string {
        return this.chars
            .slice(start, end)
            .join('');
    }
}