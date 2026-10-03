"""Small offline validator for the JSON Schema keywords used by this project.

Not a general JSON Schema implementation. Keep schemas within these keywords;
unknown assertion keywords fail so validation cannot silently lose coverage.
"""
from datetime import date
import json
import re

KEYS={'$schema','title','description','type','const','enum','required','properties','additionalProperties','items','minItems','maxItems','uniqueItems','minLength','pattern','format','minimum'}

def validate_schema(value,schema,context='$'):
    errors=[]
    unknown=set(schema)-KEYS
    if unknown:return [context+': unsupported schema keywords '+', '.join(sorted(unknown))]
    kind=schema.get('type')
    matches={'object':lambda v:isinstance(v,dict),'array':lambda v:isinstance(v,list),'string':lambda v:isinstance(v,str),'integer':lambda v:type(v)is int,'boolean':lambda v:type(v)is bool}
    if kind and (kind not in matches or not matches[kind](value)):return [context+': schema type '+str(kind)]
    if 'const' in schema and (value!=schema['const'] or type(value)!=type(schema['const'])):errors.append(context+': invalid constant')
    if 'enum' in schema and value not in schema['enum']:errors.append(context+': invalid enum')
    if isinstance(value,dict):
        for key in schema.get('required',[]):
            if key not in value:errors.append(context+': missing '+key)
        for key,v in value.items():
            if key in schema.get('properties',{}):errors+=validate_schema(v,schema['properties'][key],context+'.'+key)
            elif schema.get('additionalProperties') is False:errors.append(context+': unexpected field '+key)
            elif isinstance(schema.get('additionalProperties'),dict):errors+=validate_schema(v,schema['additionalProperties'],context+'.'+key)
    if isinstance(value,list):
        if len(value)<schema.get('minItems',0) or len(value)>schema.get('maxItems',float('inf')):errors.append(context+': invalid array length')
        if schema.get('uniqueItems') and len({json.dumps(x,sort_keys=True) for x in value})!=len(value):errors.append(context+': duplicate array values')
        for n,v in enumerate(value):errors+=validate_schema(v,schema.get('items',{}),context+f'[{n}]')
    if isinstance(value,str):
        if len(value)<schema.get('minLength',0):errors.append(context+': text too short')
        if 'pattern' in schema and not re.search(schema['pattern'],value):errors.append(context+': invalid pattern')
        if schema.get('format')=='date':
            try:
                if date.fromisoformat(value).isoformat()!=value:raise ValueError()
            except ValueError:errors.append(context+': invalid ISO date')
    if type(value)is int and value<schema.get('minimum',float('-inf')):errors.append(context+': value below minimum')
    return errors
