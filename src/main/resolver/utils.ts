import { NamespaceDefinition, SyntaxType, ThriftDocument, ThriftStatement } from '@creditkarma/thrift-parser'
import * as path from 'path'

import { INamespace, INamespaceMap } from '../types'

function createPathForNamespace(outPath: string, ns: string, name: string = 'index'): string {
    return path.resolve(outPath, ns.split('.').slice(-1).join('/'), name + '.ts')
}

function emptyNamespace(outPath: string = ''): INamespace {
    return {
        scope: '',
        name: '',
        path: createPathForNamespace(outPath, ''),
    }
}

/**
 * In Scrooge we are defaulting to use the Java namespace, so keeping that for now.
 * Probably want to update at somepoint to not fall back to that, or have the fallback
 * be configurable.
 *
 * @param namespaces
 */
function getNamesapce(outPath: string, namespaces: INamespaceMap): INamespace {
    return namespaces.js != null
        ? namespaces.js
        : namespaces.java != null ? namespaces.java : emptyNamespace(outPath)
}

/**
 * Find the namespace for use by this file.
 *
 * @param thrift
 */
export function resolveNamespace(outPath: string, thrift: ThriftDocument, fileName: string): INamespace {
    const statements: Array<NamespaceDefinition> = thrift.body.filter(
        (next: ThriftStatement): next is NamespaceDefinition => {
            return next.type === SyntaxType.NamespaceDefinition
        },
    )

    return getNamesapce(
        outPath,
        statements.reduce(
            (acc: INamespaceMap, next: NamespaceDefinition) => {
                acc[next.scope.value] = {
                    scope: next.scope.value,
                    name: next.name.value,
                    path: createPathForNamespace(outPath, next.name.value, fileName),
                }
                return acc
            },
            {} as INamespaceMap,
        ),
    )
}
