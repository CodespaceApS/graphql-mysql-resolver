const Knex = require('knex')
const _auth = require('./auth')

const prefix = (props, table) => Object.keys(props).reduce((acc, x) => {
  acc[table + '.' + x] = props[x]
  return acc
}, {})

const unflatten = data =>
  Object.keys(data).reduce((acc, x) => {
    if (x.indexOf('__') > -1) {
      const [sub, name] = x.split('__')
      if (acc[sub]) {
        acc[sub][name] = data[x]
      } else {
        acc[sub] = {
          [name]: data[x]
        }
      }
    } else {
      acc[x] = data[x]
    }
    return acc
  }, {})

const unflattenList = data => data.map(unflatten)
const isFieldNode = x => x.kind === 'Field'

const client = Knex({
  client: "mysql2", connection: {
    host: process.env.host,
    user: process.env.user,
    port: process.env.port || 3306,
    password: process.env.password,
    database: process.env.database,
    dateStrings: true
  }
})

module.exports.auth = _auth
module.exports.mysql = client

const handleEntity = async (resolverProps, astType, _table, returns = null, _forceProps = {}, _manyJoin = null) => {
  let table = _table
  const [_, props, _ctx, info] = resolverProps

  const initProps = {
    where: {},
    limit: -1,
    orderBy: ''
  }

  const _props = returns ? {
    ...initProps,
    ..._forceProps,
    ...props,
  } : {
      ...initProps,
      ...props,
      ..._forceProps,
    }


  const hasWhere = Object.keys(_props.where).length > 0
  const hasLimit = _props.limit != -1
  const hasOrderBy = _props.orderBy.length > 0

  const query = info.fieldNodes.find(field => field.name.value === info.fieldName);
  const returnList = returns !== null ? returns : info.schema.getType('Query').astNode.fields.find(x => x.name.value === query.name.value).type.kind.toLowerCase().indexOf('list') > -1
  const type = info.schema.getType(astType).astNode

  const getFieldDef = (field) => type.fields.find(x => x.name.value === field.name.value)
  const getDirective = (field, directive) => getFieldDef(field) ? getFieldDef(field).directives.find(x => x.name.value === directive) : null
  const sql = client.from(table)

  if (_manyJoin) {
    const __manyJoin = _manyJoin.toLowerCase()
    sql.leftJoin(`${__manyJoin}s as ${__manyJoin}`, `${table}.${__manyJoin}Id`, `${__manyJoin}.id`);
    table = __manyJoin
  }

  if (hasWhere) {
    sql.where(prefix(_props.where, _table))
  }
  if (hasLimit) {
    sql.limit(_props.limit)
  }
  if (hasOrderBy) {
    sql.orderByRaw(_props.orderBy)
  }
  const normalFieldsFilter = field => !getDirective(field, 'toOne') && !getDirective(field, 'toMany') && !getDirective(field, 'toManyMany')

  for (const field of query.selectionSet.selections.filter(isFieldNode).filter(normalFieldsFilter)) {
    if (field.name.value !== '__typename') {
      sql.select(table + '.' + field.name.value);
    }
  }

  for (const field of query.selectionSet.selections.filter(isFieldNode).filter(field => getDirective(field, 'toOne'))) {
    const joinEntity = getFieldDef(field).type.name.value.toLowerCase()
    const graphName = field.name.value.toLowerCase()

    sql.leftJoin(`${joinEntity}s as ${joinEntity}`, `${table}.${joinEntity}Id`, `${joinEntity}.id`);
    for (const userField of field.selectionSet.selections.filter(isFieldNode)) {
      if (userField.name.value !== '__typename') {
        sql.select(
          `${joinEntity}.${userField.name.value} as ${graphName}__${userField.name.value}`
        );
      }
    }
  }
  let partial = returnList ? unflattenList(await sql) : unflatten(await sql.first())

  for (const field of query.selectionSet.selections.filter(isFieldNode).filter(field => getDirective(field, 'toMany'))
  ) {
    const subAst = getFieldDef(field).type.type.name.value
    const subReturnList = getFieldDef(field).type.kind.toLowerCase().indexOf('list') > -1
    const subTable = field.name.value.toLowerCase()
    if (returnList) {
      for (const entity of partial) {
        const subProps = { where: { [astType.toLowerCase() + 'Id']: entity.id } }
        const secondPartial = await handleEntity(
          [_,
            subProps,
            _ctx,
            {
              ...info,
              fieldNodes: [{ ...query, selectionSet: field.selectionSet }]
            }], subAst, subTable, subReturnList)

        const current = partial.find(x => x.id === entity.id)
        current[field.name.value] = secondPartial
      }
    } else {
      const subProps = { where: { [astType.toLowerCase() + 'Id']: partial.id } }
      const secondPartial = await handleEntity(
        [_,
          subProps,
          _ctx,
          {
            ...info,
            fieldNodes: [{ ...query, selectionSet: field.selectionSet }]
          }], subAst, subTable, subReturnList)
      partial = {
        ...partial,
        [field.name.value]: secondPartial
      }
    }
  }

  for (const field of query.selectionSet.selections.filter(isFieldNode).filter(field => getDirective(field, 'toManyMany'))
  ) {
    const subAst = getFieldDef(field).type.type.name.value
    const subReturnList = getFieldDef(field).type.kind.toLowerCase().indexOf('list') > -1

    let jsubTable = field.name.value.toLowerCase()
    let subTable = ''
    if (getDirective(field, 'first')) {
      subTable = table + '_' + jsubTable
    } else {
      subTable = jsubTable + '_' + table
    }
    if (returnList) {
      for (const entity of partial) {
        const subProps = { where: { [astType.toLowerCase() + 'Id']: entity.id } }
        const secondPartial = await handleEntity(
          [_,
            subProps,
            _ctx,
            {
              ...info,
              fieldNodes: [{ ...query, selectionSet: field.selectionSet }]
            }], subAst, subTable, subReturnList, {}, subAst)

        const current = partial.find(x => x.id === entity.id)
        current[field.name.value] = secondPartial
      }
    } else {
      const subProps = { where: { [astType.toLowerCase() + 'Id']: partial.id } }
      console.log(subTable, getDirective(field, '@first'))
      const secondPartial = await handleEntity(
        [_,
          subProps,
          _ctx,
          {
            ...info,
            fieldNodes: [{ ...query, selectionSet: field.selectionSet }]
          }], subAst, subTable, subReturnList, {}, subAst)
      partial = {
        ...partial,
        [field.name.value]: secondPartial
      }
    }
  }

  return partial
}

module.exports.query = (astType, table, forceProps = {}) => async (...props) => {
  // Lav default where, plus allow where + limit fra props.
  let _forceProps = {}
  if (typeof forceProps === "function") {
    const { user } = props[2]
    _forceProps = forceProps({ user, props: props[1] })
  }
  const partial = await handleEntity(props, astType, table, null, _forceProps)
  return partial;
}

module.exports.hardDelete = (table, cfg = { postQuery: null }) => async (..._props) => {
  const [_, props, _ctx, info] = _props
  const { postQuery } = cfg
  const { id } = props
  await client(table)
    .where('id', id)
    .del()

  if (postQuery) {
    await postQuery(client, id)
  }

  return {
    result: true
  }
}

module.exports.update = (table, cfg = { inputReducer: null, postQuery: null }) => async (..._props) => {
  const [_, props, _ctx, info] = _props
  const { id, input } = props
  const { inputReducer, postQuery } = cfg
  if (!id) throw 'no id'
  await client(table)
    .where('id', id)
    .update(inputReducer ? inputReducer(input, {
      props, ctx: _ctx
    }) : input)

  if (postQuery) {
    await postQuery(client, id, input)
  }


  return client.from(table).where({ id: id }).first()
}

module.exports.create = (table, cfg = { inputReducer: null, postQuery: null }) => async (..._props) => {
  const [_, props, _ctx, info] = _props
  const { input } = props
  const { inputReducer, postQuery } = cfg

  const [id] = await client(table)
    .insert(inputReducer ? inputReducer(input, {
      props, ctx: _ctx
    }) : input)

  if (postQuery) {
    await postQuery(client, id, input)
  }

  return client.from(table).where({ id: id }).first()
}