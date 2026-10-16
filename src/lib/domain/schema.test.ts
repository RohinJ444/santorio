import {describe,it,expect} from 'vitest';
import {validateRecord,foodSchema} from './schema';
import {defaultProfile,type FoodRecord} from './types';
const id='a8e413cd-8d59-4e12-8915-5fe28dfb8a44';
const food:FoodRecord={id,name:'Example pasta',brand:'',revision:1,basis:{quantity:100,unit:'g'},nutrients:[{key:'energy',label:'Energy',unit:'kcal',amount:350},{key:'protein',label:'Protein',unit:'g',amount:20},{key:'carbs',label:'Carbs',unit:'g',amount:60},{key:'fat',label:'Fat',unit:'g',amount:3},{key:'calcium',label:'Calcium',unit:'mg',amount:null}],sourceUrl:'Manufacturer label',notes:'',ingredientsText:''};
describe('API nutrition validation',()=>{
 it('preserves unknown nutrients and source references',()=>{const result=foodSchema.parse(food);expect(result.nutrients.at(-1)?.amount).toBeNull();expect(result.sourceUrl).toBe('Manufacturer label');});
 it('requires known macros with canonical units',()=>{expect(foodSchema.safeParse({...food,nutrients:food.nutrients.filter(n=>n.key!=='protein')}).success).toBe(false);expect(foodSchema.safeParse({...food,nutrients:food.nutrients.map(n=>n.key==='protein'?{...n,unit:'mg'}:n)}).success).toBe(false);});
 it('rejects duplicate nutrients and noncanonical micronutrient units',()=>{expect(foodSchema.safeParse({...food,nutrients:[...food.nutrients,food.nutrients[0]]}).success).toBe(false);expect(foodSchema.safeParse({...food,nutrients:food.nutrients.map(n=>n.key==='calcium'?{...n,unit:'g'}:n)}).success).toBe(false);});
 it('rejects unknown fields and invalid identity',()=>{expect(foodSchema.safeParse({...food,owner_id:'someone-else'}).success).toBe(false);expect(foodSchema.safeParse({...food,id:'../../etc'}).success).toBe(false);});
 it('requires a real anchor and compatible ingredient amounts',()=>{const recipe={id,name:'Pasta',revision:1,ingredients:[{id,food,quantity:2,unit:'g'}],anchorIngredientId:id,notes:''};expect(validateRecord('recipes',recipe)).toEqual(recipe);expect(()=>validateRecord('recipes',{...recipe,anchorIngredientId:'ccbb11ae-28a4-4526-b58a-aed26c580c19'})).toThrow();expect(()=>validateRecord('recipes',{...recipe,ingredients:[{id,food,quantity:2,unit:'cup'}]})).toThrow();});
 it('accepts incomplete workout drafts but validates dates',()=>{const workout={id,date:'2026-10-16',title:'',locationId:null,status:'active',startedAt:'2026-10-16T10:00:00Z',notes:'',exercises:[],healthWorkoutIds:[]};expect(validateRecord('workouts',workout).title).toBe('');expect(()=>validateRecord('workouts',{...workout,date:'2026-02-30'})).toThrow();});
 it('validates timezone while allowing unfinished onboarding',()=>{expect(validateRecord('profiles',defaultProfile()).birthday).toBe('');expect(()=>validateRecord('profiles',{...defaultProfile(),timezone:'bad/zone'})).toThrow();});
});
