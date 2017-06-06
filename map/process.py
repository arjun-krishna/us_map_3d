import json
import random

with open('us-states-topo.json') as f :
    data = json.load(f)
    target1 = open('states_info.csv', 'w')
    target2 = open('random_display_data.csv','w')
    target1.write('FIPS,name\n')
    target2.write('FIPS,random\n')
    for obj in data['objects']['us-states-geo']['geometries'] :
        props = obj['properties']
        target1.write(props['STATE']+','+props['NAME']+'\n')
        target2.write(props['STATE']+','+str(1)+'\n')
    target1.close()
    target2.close()
