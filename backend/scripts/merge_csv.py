import pandas as pd
from config import Config

products    = pd.read_csv(Config.TRAINING_DATA_PATH/"raw"/"products.csv")
aisles      = pd.read_csv(Config.TRAINING_DATA_PATH/"raw"/"aisles.csv")
departments = pd.read_csv(Config.TRAINING_DATA_PATH/"raw"/"departments.csv")

df = (
    products
    .merge(aisles, on="aisle_id")
    .merge(departments, on="department_id")
    [["product_name", "aisle", "department"]]
)

# Drop missing and bulk (little data)
DROP = {"missing","bulk"}
df = df[~df["department"].isin(DROP)]

pd.set_option('display.max_rows', None)

print(df.shape)
print("\n\n")
print(df["department"].value_counts())
print("\n\n")
print(df["aisle"].value_counts())

df.to_csv(Config.TRAINING_DATA_PATH/"instacart_labeled.csv", index=False)

"""
department
personal care      6563
snacks             6264
pantry             5371
beverages          4365
frozen             4007
dairy eggs         3449
household          3085
canned goods       2092
dry goods pasta    1858
produce            1684
bakery             1516
deli               1322
international      1139
breakfast          1115
babies             1081
alcohol            1054
pets                972
meat seafood        907
other               548

aisle
candy chocolate                  1246
ice cream ice                    1091
vitamins supplements             1038
yogurt                           1026
chips pretzels                    989
tea                               894
packaged cheese                   891
frozen meals                      880
cookies cakes                     874
energy granola bars               832
hair care                         816
spices seasonings                 797
juice nectars                     792
crackers                          747
soup broth bouillon               737
baby food formula                 718
coffee                            680
refrigerated                      675
cleaning products                 655
baking ingredients                623
packaged vegetables fruits        615
asian foods                       605
nuts seeds dried fruit            582
fresh vegetables                  569
oral hygiene                      565
salad dressing toppings           560
bread                             557
other                             548
instant foods                     543
soap                              525
laundry                           506
body lotions soap                 504
cat food care                     499
spreads                           493
canned jarred vegetables          487
dog food care                     473
condiments                        466
soft drinks                       463
doughs gelatins bake mixes        463
dry pasta                         457
cereal                            454
cold flu allergy                  427
marinades meat preparation        409
pickled goods olives              402
pasta sauce                       399
hot dogs bacon sausage            387
frozen appetizers sides           386
beers coolers                     385
fresh fruits                      382
oils vinegars                     375
lunch meat                        373
frozen produce                    361
fruit vegetable snacks            356
air fresheners candles            355
water seltzer sparkling water     344
canned meals beans                342
digestion                         338
grains rice dried goods           336
frozen pizza                      335
fresh dips tapenades              327
protein meal replacements         325
paper goods                       322
prepared meals                    317
deodorants                        317
popcorn jerky                     316
more household                    308
hot cereal pancake mixes          303
bakery desserts                   297
frozen breakfast                  296
energy sports drinks              294
soy lactosefree                   293
baking supplies decor             290
feminine care                     285
canned meat seafood               283
facial care                       277
specialty cheeses                 271
preserved dips spreads            264
latino foods                      257
skin care                         245
milk                              243
canned fruit applesauce           243
tortillas flat bread              241
first aid                         240
red wines                         232
frozen meat seafood               229
honeys syrups nectars             229
breakfast bakery                  226
cocoa drink mixes                 223
kitchen supplies                  218
food storage                      206
dish detergents                   204
plates bowls cups flatware        199
shave needs                       198
buns rolls                        195
spirits                           195
other creams cheeses              191
frozen vegan vegetarian           189
diapers wipes                     187
granola                           185
beauty                            178
breakfast bars pastries           173
muscles joints pain relief        172
kosher foods                      169
mint gum                          168
cream                             161
tofu meat alternatives            159
butter                            150
white wines                       147
prepared soups salads             146
baby bath body care               132
eggs                              125
fresh pasta                       123
eye ear care                      113
frozen dessert                    112
trash bags liners                 112
indian foods                      108
meat counter                      105
packaged meat                     100
packaged poultry                   99
refrigerated pudding desserts      98
specialty wines champagnes         95
fresh herbs                        86
ice cream toppings                 85
poultry counter                    82
frozen breads doughs               81
packaged seafood                   80
trail mix snack mix                69
seafood counter                    54
frozen juice                       47
baby accessories                   44
packaged produce                   32
"""