import * as ts from 'typescript'

import {
    ContainerType,
    FieldDefinition,
    FunctionType,
    InterfaceWithFields,
    SyntaxType,
} from '@creditkarma/thrift-parser'

import {
    COMMON_IDENTIFIERS,
    THRIFT_IDENTIFIERS,
    THRIFT_TYPES,
} from '../identifiers'

import {
    createAnyType,
    createNumberType,
    thriftTypeForFieldType,
    typeNodeForFieldType,
} from '../types'

import {
    createAssignmentStatement,
    createConstStatement,
    createEqualsCheck,
    createFunctionParameter,
    createLet,
    createLetStatement,
    createMethodCall,
    createMethodCallStatement,
    getInitializerForField,
    hasRequiredField,
    propertyAccessForIdentifier,
    throwProtocolException,
} from '../utils'

import { IRenderState, IResolvedIdentifier } from '../../../types'

import { READ_METHODS } from './methods'

import { strictNameForStruct, toolkitName } from './utils'

export function createTempVariables(
    node: InterfaceWithFields,
): Array<ts.VariableStatement> {
    if (node.fields.length > 0) {
        return [
            createLetStatement(
                COMMON_IDENTIFIERS._args,
                createAnyType(),
                ts.createObjectLiteral(),
            ),
        ]
    } else {
        return []
    }
}

export function createDecodeMethod(
    node: InterfaceWithFields,
    state: IRenderState,
): ts.MethodDeclaration {
    const inputParameter: ts.ParameterDeclaration = createInputParameter()
    const tempVariables: Array<ts.VariableStatement> = createTempVariables(node)

    /**
     * cosnt ret: { fieldName: string; fieldType: Thrift.Type; fieldId: number; } = input.readFieldBegin()
     * const fieldType: Thrift.Type = ret.fieldType
     * const fieldId: number = ret.fieldId
     */
    const ret: ts.VariableStatement = createConstStatement(
        'ret',
        ts.createTypeReferenceNode(THRIFT_IDENTIFIERS.IThriftField, undefined),
        readFieldBegin(),
    )

    const fieldType: ts.VariableStatement = createConstStatement(
        'fieldType',
        ts.createTypeReferenceNode(THRIFT_IDENTIFIERS.Thrift_Type, undefined),
        propertyAccessForIdentifier('ret', 'fieldType'),
    )

    const fieldId: ts.VariableStatement = createConstStatement(
        'fieldId',
        createNumberType(),
        propertyAccessForIdentifier('ret', 'fieldId'),
    )

    /**
     * if (fieldType === Thrift.Type.STOP) {
     *     break;
     * }
     */
    const checkStop: ts.IfStatement = ts.createIf(
        createEqualsCheck(COMMON_IDENTIFIERS.fieldType, THRIFT_TYPES.STOP),
        ts.createBlock([ts.createBreak()], true),
    )

    const whileLoop: ts.WhileStatement = ts.createWhile(
        ts.createLiteral(true),
        ts.createBlock(
            [
                ret,
                fieldType,
                fieldId,
                checkStop,
                ts.createSwitch(
                    COMMON_IDENTIFIERS.fieldId, // what to switch on
                    ts.createCaseBlock([
                        ...node.fields.map((next: FieldDefinition) => {
                            return createCaseForField(next, state)
                        }),
                        ts.createDefaultClause([createSkipBlock()]),
                    ]),
                ),
                readFieldEnd(),
            ],
            true,
        ),
    )

    return ts.createMethod(
        undefined,
        undefined,
        undefined,
        COMMON_IDENTIFIERS.decode,
        undefined,
        undefined,
        [inputParameter],
        ts.createTypeReferenceNode(
            ts.createIdentifier(strictNameForStruct(node, state)),
            undefined,
        ), // return type
        ts.createBlock(
            [
                ...tempVariables,
                readStructBegin(),
                whileLoop,
                readStructEnd(),
                createReturnForStruct(node),
            ],
            true,
        ),
    )
}

export function createInputParameter(): ts.ParameterDeclaration {
    return createFunctionParameter(
        'input', // param name
        ts.createTypeReferenceNode(THRIFT_IDENTIFIERS.TProtocol, undefined), // param type
    )
}

export function createCheckForFields(
    fields: Array<FieldDefinition>,
): ts.BinaryExpression {
    return fields
        .filter((next: FieldDefinition) => {
            return next.requiredness === 'required'
        })
        .map(
            (next: FieldDefinition): ts.BinaryExpression => {
                return ts.createBinary(
                    ts.createIdentifier(`_args.${next.name.value}`),
                    ts.SyntaxKind.ExclamationEqualsEqualsToken,
                    COMMON_IDENTIFIERS.undefined,
                )
            },
        )
        .reduce((acc: ts.BinaryExpression, next: ts.BinaryExpression) => {
            return ts.createBinary(
                acc,
                ts.SyntaxKind.AmpersandAmpersandToken,
                next,
            )
        })
}

/**
 * EXAMPLE
 *
 * case 1: {
 *   if (fieldType === Thrift.Type.I32) {
 *     this.id = input.readI32();
 *   }
 *   else {
 *     input.skip(fieldType);
 *   }
 *   break;
 * }
 */
export function createCaseForField(
    field: FieldDefinition,
    state: IRenderState,
): ts.CaseClause {
    const fieldAlias: ts.Identifier = ts.createUniqueName('value')
    const checkType: ts.IfStatement = ts.createIf(
        createEqualsCheck(
            COMMON_IDENTIFIERS.fieldType,
            thriftTypeForFieldType(field.fieldType, state.identifiers),
        ),
        ts.createBlock(
            [
                ...readValueForFieldType(field.fieldType, fieldAlias, state),
                ...endReadForField(fieldAlias, field),
            ],
            true,
        ),
        createSkipBlock(),
    )

    if (field.fieldID !== null) {
        return ts.createCaseClause(ts.createLiteral(field.fieldID.value), [
            checkType,
            ts.createBreak(),
        ])
    } else {
        throw new Error(`FieldID on line ${field.loc.start.line} is null`)
    }
}

export function endReadForField(
    fieldName: ts.Identifier,
    field: FieldDefinition,
): Array<ts.Statement> {
    switch (field.fieldType.type) {
        case SyntaxType.VoidKeyword:
            return []

        default:
            return [
                createAssignmentStatement(
                    ts.createIdentifier(`_args.${field.name.value}`),
                    fieldName,
                ),
            ]
    }
}

export function createReturnForStruct(node: InterfaceWithFields): ts.Statement {
    if (hasRequiredField(node)) {
        return ts.createIf(
            createCheckForFields(node.fields),
            ts.createBlock([createReturnValue(node)], true),
            ts.createBlock(
                [
                    throwProtocolException(
                        'UNKNOWN',
                        `Unable to read ${node.name.value} from input`,
                    ),
                ],
                true,
            ),
        )
    } else {
        return createReturnValue(node)
    }
}

function createReturnValue(node: InterfaceWithFields): ts.ReturnStatement {
    return ts.createReturn(
        ts.createObjectLiteral(
            node.fields.map(
                (next: FieldDefinition): ts.ObjectLiteralElementLike => {
                    return ts.createPropertyAssignment(
                        next.name.value,
                        getInitializerForField('_args', next),
                    )
                },
            ),
            true, // multiline
        ),
    )
}

export function readValueForIdentifier(
    id: IResolvedIdentifier,
    fieldType: FunctionType,
    fieldName: ts.Identifier,
    state: IRenderState,
): Array<ts.Statement> {
    switch (id.definition.type) {
        case SyntaxType.ConstDefinition:
            throw new TypeError(
                `Identifier ${
                    id.definition.name.value
                } is a value being used as a type`,
            )

        case SyntaxType.ServiceDefinition:
            throw new TypeError(
                `Service ${id.definition.name.value} is being used as a type`,
            )

        case SyntaxType.StructDefinition:
        case SyntaxType.UnionDefinition:
        case SyntaxType.ExceptionDefinition:
            return [
                // const field: type =
                createConstStatement(
                    fieldName,
                    typeNodeForFieldType(fieldType, state),
                    ts.createCall(
                        ts.createPropertyAccess(
                            ts.createIdentifier(toolkitName(id.resolvedName)),
                            COMMON_IDENTIFIERS.decode,
                        ),
                        undefined,
                        [COMMON_IDENTIFIERS.input],
                    ),
                ),
            ]

        case SyntaxType.EnumDefinition:
            return [
                createConstStatement(
                    fieldName,
                    typeNodeForFieldType(fieldType, state),
                    createMethodCall(
                        'input',
                        READ_METHODS[SyntaxType.I32Keyword],
                    ),
                ),
            ]

        case SyntaxType.TypedefDefinition:
            return readValueForFieldType(
                id.definition.definitionType,
                fieldName,
                state,
            )

        default:
            const msg: never = id.definition
            throw new Error(`Non-exhaustive match for: ${msg}`)
    }
}

export function readValueForFieldType(
    fieldType: FunctionType,
    fieldName: ts.Identifier,
    state: IRenderState,
): Array<ts.Statement> {
    switch (fieldType.type) {
        case SyntaxType.Identifier:
            return readValueForIdentifier(
                state.identifiers[fieldType.value],
                fieldType,
                fieldName,
                state,
            )

        /**
         * Base types:
         *
         * SyntaxType.StringKeyword | SyntaxType.DoubleKeyword | SyntaxType.BoolKeyword |
         * SyntaxType.I8Keyword | SyntaxType.I16Keyword | SyntaxType.I32Keyword |
         * SyntaxType.I64Keyword | SyntaxType.BinaryKeyword | SyntaxType.ByteKeyword;
         */
        case SyntaxType.BoolKeyword:
        case SyntaxType.ByteKeyword:
        case SyntaxType.BinaryKeyword:
        case SyntaxType.StringKeyword:
        case SyntaxType.DoubleKeyword:
        case SyntaxType.I8Keyword:
        case SyntaxType.I16Keyword:
        case SyntaxType.I32Keyword:
        case SyntaxType.I64Keyword:
            // const <fieldName>: <fieldType> = input.<readMethod>();
            return [
                createConstStatement(
                    fieldName,
                    typeNodeForFieldType(fieldType, state),
                    createMethodCall('input', READ_METHODS[fieldType.type]),
                ),
            ]

        /**
         * Container types:
         *
         * SetType | MapType | ListType
         */
        case SyntaxType.MapType:
            return [
                createConstStatement(
                    fieldName,
                    typeNodeForFieldType(fieldType, state),
                    ts.createNew(
                        COMMON_IDENTIFIERS.Map, // class name
                        [
                            typeNodeForFieldType(fieldType.keyType, state),
                            typeNodeForFieldType(fieldType.valueType, state),
                        ],
                        [],
                    ),
                ),
                ...loopOverContainer(fieldType, fieldName, state),
            ]

        case SyntaxType.ListType:
            return [
                createConstStatement(
                    fieldName,
                    typeNodeForFieldType(fieldType, state),
                    ts.createNew(
                        COMMON_IDENTIFIERS.Array, // class name
                        [typeNodeForFieldType(fieldType.valueType, state)],
                        [],
                    ),
                ),
                ...loopOverContainer(fieldType, fieldName, state),
            ]

        case SyntaxType.SetType:
            return [
                createConstStatement(
                    fieldName,
                    typeNodeForFieldType(fieldType, state),
                    ts.createNew(
                        COMMON_IDENTIFIERS.Set, // class name
                        [typeNodeForFieldType(fieldType.valueType, state)],
                        [],
                    ),
                ),
                ...loopOverContainer(fieldType, fieldName, state),
            ]

        case SyntaxType.VoidKeyword:
            return [
                createMethodCallStatement('input', 'skip', [
                    COMMON_IDENTIFIERS.fieldType,
                ]),
            ]

        default:
            const msg: never = fieldType
            throw new Error(`Non-exhaustive match for: ${msg}`)
    }
}

/**
 * EXAMPLE OF MAP FIELD
 *
 * if (fieldType === Thrift.Type.MAP) {
 *   this.field1 = new Map<string, string>();
 *   const metadata_1: {
 *     ktype: Thrift.Type;
 *     vtype: Thrift.Type;
 *     size: number;
 *   } = input.readMapBegin();
 *   const size_1: number = metadata_1.size;
 *   for (let i_1: number = 0; i_1 < size_1; i_1++) {
 *     const key_2: string = input.readString();
 *     const value_2: string = input.readString();
 *     this.field1.set(key_2, value_2);
 *   }
 *   input.readMapEnd();
 * }
 */
function loopOverContainer(
    fieldType: ContainerType,
    fieldName: ts.Identifier,
    state: IRenderState,
): Array<ts.Statement> {
    const incrementer: ts.Identifier = ts.createUniqueName('i')
    const metadata: ts.Identifier = ts.createUniqueName('metadata')
    const size: ts.Identifier = ts.createUniqueName('size')

    return [
        // const metadata: { ktype: Thrift.Type; vtype: Thrift.Type; size: number; } = input.readMapBegin()
        createConstStatement(
            metadata,
            metadataTypeForFieldType(fieldType),
            readBeginForFieldType(fieldType),
        ),
        // cosnt size: number = metadata.size
        createConstStatement(
            size,
            createNumberType(),
            propertyAccessForIdentifier(metadata, 'size'),
        ),
        // for (let i = 0, i < size; i++) { .. }
        ts.createFor(
            createLet(incrementer, createNumberType(), ts.createLiteral(0)),
            ts.createLessThan(incrementer, size),
            ts.createPostfixIncrement(incrementer),
            ts.createBlock(loopBody(fieldType, fieldName, state), true),
        ),
        ts.createStatement(readEndForFieldType(fieldType)),
    ]
}

export function metadataTypeForFieldType(
    fieldType: ContainerType,
): ts.TypeNode {
    switch (fieldType.type) {
        case SyntaxType.MapType:
            return ts.createTypeReferenceNode(
                THRIFT_IDENTIFIERS.IThriftMap,
                undefined,
            )

        case SyntaxType.SetType:
            return ts.createTypeReferenceNode(
                THRIFT_IDENTIFIERS.IThriftSet,
                undefined,
            )

        case SyntaxType.ListType:
            return ts.createTypeReferenceNode(
                THRIFT_IDENTIFIERS.IThriftList,
                undefined,
            )

        default:
            const msg: never = fieldType
            throw new Error(`Non-exhaustive match for: ${msg}`)
    }
}

function loopBody(
    fieldType: ContainerType,
    fieldName: ts.Identifier,
    state: IRenderState,
): Array<ts.Statement> {
    const value: ts.Identifier = ts.createUniqueName('value')

    switch (fieldType.type) {
        case SyntaxType.MapType:
            const key: ts.Identifier = ts.createUniqueName('key')
            return [
                ...readValueForFieldType(fieldType.keyType, key, state),
                ...readValueForFieldType(fieldType.valueType, value, state),
                createMethodCallStatement(fieldName, 'set', [key, value]),
            ]

        case SyntaxType.ListType:
            return [
                ...readValueForFieldType(fieldType.valueType, value, state),
                createMethodCallStatement(fieldName, 'push', [value]),
            ]

        case SyntaxType.SetType:
            return [
                ...readValueForFieldType(fieldType.valueType, value, state),
                createMethodCallStatement(fieldName, 'add', [value]),
            ]
    }
}

function readBeginForFieldType(fieldType: ContainerType): ts.CallExpression {
    switch (fieldType.type) {
        case SyntaxType.MapType:
            return readMapBegin()

        case SyntaxType.SetType:
            return readSetBegin()

        case SyntaxType.ListType:
            return readListBegin()

        default:
            const msg: never = fieldType
            throw new Error(`Non-exhaustive match for: ${msg}`)
    }
}

function readEndForFieldType(fieldType: ContainerType): ts.CallExpression {
    switch (fieldType.type) {
        case SyntaxType.MapType:
            return readMapEnd()

        case SyntaxType.SetType:
            return readSetEnd()

        case SyntaxType.ListType:
            return readListEnd()

        default:
            const msg: never = fieldType
            throw new Error(`Non-exhaustive match for: ${msg}`)
    }
}

// input.readStructBegin(<structName>)
export function readStructBegin(): ts.ExpressionStatement {
    return createMethodCallStatement('input', 'readStructBegin')
}

// input.readStructEnd()
export function readStructEnd(): ts.ExpressionStatement {
    return createMethodCallStatement('input', 'readStructEnd')
}

// input.readFieldBegin()
export function readFieldBegin(): ts.CallExpression {
    return createMethodCall('input', 'readFieldBegin')
}

// input.readFieldEnd()
export function readFieldEnd(): ts.ExpressionStatement {
    return createMethodCallStatement('input', 'readFieldEnd')
}

// input.readMapBegin()
export function readMapBegin(): ts.CallExpression {
    return createMethodCall('input', 'readMapBegin')
}

// input.readMapEnd()
export function readMapEnd(): ts.CallExpression {
    return createMethodCall('input', 'readMapEnd')
}

// input.readListBegin()
export function readListBegin(): ts.CallExpression {
    return createMethodCall('input', 'readListBegin')
}

// input.readListEnd()
export function readListEnd(): ts.CallExpression {
    return createMethodCall('input', 'readListEnd')
}

// input.readSetBegin()
export function readSetBegin(): ts.CallExpression {
    return createMethodCall('input', 'readSetBegin')
}

// input.readSetEnd()
export function readSetEnd(): ts.CallExpression {
    return createMethodCall('input', 'readSetEnd')
}

// input.skip(fieldType)
export function createSkipBlock(): ts.Block {
    return ts.createBlock([createSkipStatement()], true)
}

function createSkipStatement(): ts.ExpressionStatement {
    return createMethodCallStatement('input', 'skip', [
        COMMON_IDENTIFIERS.fieldType,
    ])
}
