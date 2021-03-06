<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7;
use GuzzleHttp\Exception\RequestException;
use Seld\Signal\SignalHandler;

class Import extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'gobelins:import {--from= : Start at given page}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import the external data : SCOM, etc.';

    /**
     * HTTP client instance.
     */
    protected $client;

    /**
     * UI: a Symfony Progress Bar instance.
     */
    protected $progress_bar;

    /**
     * The API result page that is being analysed.
     */
    protected $current_page;

    /**
     * Instance of SignalHandler, used to gracefully exit
     * when sent a SIGINT (ctrl-c).
     */
    protected $signal_handle;

    /**
     * Log of processing error or remarks that should be
     * displayed in the terminal after exit;
     */
    protected $report = [];
    
    
    /**
     * Any shared HTTP options, like auth…
     */
    protected $http_options = [];

    /**
     * Create a new command instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $this->signal_handle = SignalHandler::create();

        // Temporarily deactivate Scout indexing.
        //\App\Models\Product::withoutSyncingToSearch(function () {
        $this->initHttpClient();
        $this->setupProgressBar();
        $this->loadScom();
        //});
    }

    private function initHttpClient()
    {
        $this->client = new Client([
            'base_uri' => env('DATASOURCE_BASEURI'),
            'timeout'  => 15.0,
        ]);
    }

    private function setupProgressBar()
    {
        $this->http_options = env('HTTP_AUTH_USERNAME') ? ['auth' => [env('HTTP_AUTH_USERNAME'), env('HTTP_AUTH_PASSWORD')]] : null;
        $response = $this->client->request('GET', '/api/products', $this->http_options);
        if ($response->getStatusCode() === 200) {
            $json_resp = json_decode($response->getBody());
            $this->progress_bar = $this->output->createProgressBar($json_resp->meta->total);
            $this->progress_bar->advance($json_resp->meta->from - 1);
        }
    }

    /**
     * Load the external SCOM data from the API.
     */
    private function loadScom()
    {
        $this->comment('Loading from datasource: ' . env('DATASOURCE_BASEURI'));

        // The root request endpoint.
        // All subsequent requests will be crawled from the next page in the response.
        // products?page=3033
        $next_page = '/api/products';
        if ($this->option('from')) {
            $next_page .= '?page=' . $this->option('from');
        }

        do {
            try {
                $response = $this->client->request('GET', $next_page, $this->http_options);
                if ($response->getStatusCode() === 200) {
                    // $this->comment('Received page: ' . $next_page);
                    
                    $json_resp = json_decode($response->getBody());
                    $this->progress_bar->setProgress($json_resp->meta->from - 1);
                    $this->current_page = $json_resp->meta->current_page;
                    
                    collect($json_resp->data)->map(function ($item) {
                        
                        // Handle core product data.
                        // $this->comment('Upserting product: ' . $item->inventory_id);
                        $this->progress_bar->setMessage('Upserting product: ' . $item->inventory_id);

                        // First save the Product object, without posting to ES.
                        // We only post to ES once we have all the relationships saved (see below).
                        $product = null;
                        \App\Models\Product::withoutSyncingToSearch(function () use (&$product, $item) {
                            $product = \App\Models\Product::updateOrCreate(
                                ['inventory_id' => $item->inventory_id],
                                [
                                    'inventory_id' => $item->inventory_id,
                                    'inventory_root' => $item->inventory_root,
                                    'inventory_number' => $item->inventory_number,
                                    'inventory_suffix' => $item->inventory_suffix,
                                    'legacy_inventory_number' => $item->legacy_inventory_number,
                                    'height_or_thickness' => $item->height_or_thickness,
                                    'length_or_diameter' => $item->length_or_diameter,
                                    'depth_or_width' => $item->depth_or_width,
                                    'conception_year' => $item->conception_year,
                                    'acquisition_origin' => $item->acquisition_origin,
                                    'acquisition_date' => $item->acquisition_date,
                                    'listed_as_historic_monument' => $item->listed_as_historic_monument,
                                    'listed_on' => $item->listed_on,
                                    'category' => $item->category,
                                    'denomination' => $item->denomination,
                                    'title_or_designation' => $item->title_or_designation,
                                    'description' => $item->description,
                                    'bibliography' => $item->bibliography,
                                    'is_published' => $item->publication_state->is_published,
                                    'publication_code' => $item->publication_state->code,
                                ]
                            );
                        });
                            
                        // Images
                        $product->images->map(function ($img) {
                            $img->delete();
                        });

                        $images = collect($item->images)
                            // Store full path of image file.
                            ->map(function ($img_obj) {
                                $img_obj->full_path = public_path('media/orig/' . trim($img_obj->path));
                                return $img_obj;
                            })
                            // Remove items for which we don't have a file.
                            ->filter(function ($img_obj) use ($item) {
                                if (file_exists($img_obj->full_path)) {
                                    return true;
                                } else {
                                    $this->progress_bar->clear();
                                    $this->warn('Error on product: ' . $item->inventory_id);
                                    $this->warn('Missing image file: ' . $img_obj->full_path);
                                    $this->info('Current page:' . $this->current_page);
                                    $this->progress_bar->display();
                                    return false;
                                }
                            })
                            // Attempt to obtain dimensions of image.
                            ->map(function ($img_obj) {
                                list($width, $height) = @getimagesize($img_obj->full_path);
                                $img_obj->width = $width;
                                $img_obj->height = $height;
                                return $img_obj;
                            })
                            // Remove items that have corrupted image metatdata.
                            ->filter(function ($img_obj) use ($item) {
                                if ($img_obj->width && $img_obj->height) {
                                    return true;
                                } else {
                                    $this->progress_bar->clear();
                                    $this->warn('Error on product: ' . $item->inventory_id);
                                    $this->warn('Invalid image:' . $img_obj->full_path);
                                    $this->info('Current page:' . $this->current_page);
                                    $this->progress_bar->display();
                                    file_put_contents(storage_path('logs/missing_files.log'), $img_obj->full_path . "\n", FILE_APPEND);
                                    return false;
                                }
                            })
                            ->map(function ($img_obj) {
                                return (array) $img_obj;
                            })
                            ->toArray();

                        if (is_array($images) && sizeof($images) > 0) {
                            $product->images()->createMany($images);
                        }


                        // ProductType
                        // We map 3 different pieces of data, in order (first one wins):
                        // - the Title or Designation (Titre ou Appellation)
                        // - the Denomination (Dénomination)
                        // - the product_type (gracat.gracat in SCOM).
                        $product_type = null;
                        collect([
                            'titapp' => $item->title_or_designation,
                            'den' => $item->denomination,
                            'gracat' => $item->product_type ? $item->product_type->name : null,
                        ])->filter(function ($value) {
                            return $value;
                        })->first(function ($value, $scom_col) use (&$product_type) {
                            $product_type = \App\Models\ProductType::mappedFrom($scom_col, $value)->first();
                            return $product_type;
                        });
                        if ($product_type) {
                            $product->productType()->associate($product_type);
                        }


                        // Drop all authorships
                        $product->authorships->map(function ($as) {
                            $as->delete();
                        });
                        
                        // Create authors
                        $authorships = collect($item->authorships);
                        $authorships->map(function ($as) {
                            \App\Models\Author::updateOrCreate(
                                ['legacy_id' => $as->author->id],
                                [
                                    'legacy_id' => $as->author->id,
                                    'name' => $as->author->name,
                                    'first_name' => $as->author->first_name,
                                    'last_name' => $as->author->last_name,
                                    'date_of_birth' => $as->author->date_of_birth,
                                    'year_of_birth' => $as->author->year_of_birth,
                                    'date_of_death' => $as->author->date_of_death,
                                    'year_of_death' => $as->author->year_of_death,
                                    'occupation' => $as->author->occupation,
                                    'birthplace' => $as->author->birthplace,
                                    'deathplace' => $as->author->deathplace,
                                    'isni_uri' => $as->author->isni_uri,
                                ]
                            );
                        });


                        // Create Authorships
                        \App\Models\Authorship::unguard();
                        $product->authorships()->createMany(
                            $authorships->map(function ($authorship_obj) {
                                return [
                                    'nature_code' => \App\Models\Authorship::authorNatureCode($authorship_obj->author_nature),
                                    'relevant_detail' => $authorship_obj->relevant_detail,
                                    'author_id' => \App\Models\Author::where('legacy_id', $authorship_obj->author->id)->first()->id,
                                ];
                            })->toArray()
                        );
                        \App\Models\Authorship::reguard();


                        // Period
                        // Periods might be updated in SCOM, so we udpate them based on the legacy_id
                        if ($item->period && $item->period->id) {
                            $period = \App\Models\Period::updateOrCreate(
                                ['legacy_id' => $item->period->id],
                                [
                                    'legacy_id' => $item->period->id,
                                    'name' => $item->period->name,
                                    'start_year' => $item->period->start_year,
                                    'end_year' => $item->period->end_year,
                                ]
                            );

                            if ($period) {
                                $product->period()->associate($period);
                            }
                        }


                        // Entry mode
                        // Entry modes might be updated in SCOM, so we udpate them based on the legacy_id
                        if ($item->acquisition_mode && $item->acquisition_mode->id) {
                            $acquisition_mode = \App\Models\EntryMode::updateOrCreate(
                                ['legacy_id' => $item->acquisition_mode->id],
                                [
                                    'legacy_id' => $item->acquisition_mode->id,
                                    'name' => $item->acquisition_mode->name,
                                ]
                            );

                            if ($acquisition_mode) {
                                $product->entryMode()->associate($acquisition_mode);
                            }
                        }


                        // Styles
                        // Also udpated based on the legacy_id
                        if ($item->product_style && $item->product_style->id) {
                            $style = \App\Models\Style::where('legacy_id', $item->product_style->id)->first();

                            if ($style) {
                                $product->style()->associate($style);
                            } elseif (preg_match('/etranger/i', $item->product_style->name) > 0) {
                                // We consolidate the English, Chinese, Japanese, etc, styles into one "Foreign" one.
                                $product->style()->associate(\App\Models\Style::where('name', 'Étranger')->first());
                            }
                        } elseif ($item->period &&
                                    $item->period->id &&
                                    $style = \App\Models\Style::mappedFrom('numepo', (string) $item->period->id)->first()) {
                            // associate the product to the style related to the period
                            $product->style()->associate($style);
                        } else {
                            // Fallback to conception year.
                            if ($item->conception_year) {
                                $style = \App\Models\Style::where([
                                    ['start_year', '<=', $item->conception_year],
                                    ['end_year', '>=', $item->conception_year]
                                ])->first();
                                if ($style) {
                                    $product->style()->associate($style);
                                }
                            }
                        }

                        // Materials
                        $material_ids = [];
                        if (is_array($item->materials) && sizeof($item->materials) > 0) {
                            $material_ids = collect($item->materials)
                                ->pluck('name')
                                ->map(function ($legacy_mat) {
                                    // Mapped from legacy SCOM "mat.mat" column.
                                    return \App\Models\Material::mappedFrom('mat', $legacy_mat)->get()->all();
                                })
                                ->flatten()
                                ->pluck('id')
                                ->all();
                        }
                        // We consider upholstery as just another material.
                        $upholstery_ids = [];
                        if (is_array($item->upholstery) && sizeof($item->upholstery) > 0) {
                            $upholstery_ids = collect($item->upholstery)
                            ->pluck('name')
                            ->map(function ($legacy_gar) {
                                // Mapped from legacy SCOM "gar.gar" column.
                                return \App\Models\Material::mappedFrom('gar', $legacy_gar)->get()->all();
                            })
                            ->flatten()
                            ->pluck('id')
                            ->all();
                        }
                        $product->materials()->sync(array_merge($material_ids, $upholstery_ids));

                        // ProductionOrigin
                        // We map multiple sources to set the production origin.
                        if ($item->product_type &&
                                $item->product_type->id &&
                                $origin = \App\Models\ProductionOrigin::mappedFrom('numgraca', (string) $item->product_type->id)->first()) {
                            $product->productionOrigin()->associate($origin);
                        } elseif ($item->inventory_root &&
                                $origin = \App\Models\ProductionOrigin::mappedFrom('inventory_root', $item->inventory_root)->first()) {
                            $product->productionOrigin()->associate($origin);
                        }




                        // Finally, save the product relationships, and sync data to ES.
                        $product->save();

                        $this->progress_bar->advance();
                    });

                    if ($this->signal_handle->isTriggered()) {
                        $this->progress_bar->clear();
                        $this->info(implode("\n", $this->report));
                        $this->warn('Interrupted at page ' . $this->current_page . '. To resume the import, run:');
                        $this->warn('$ php artisan gobelins:import -vvv --from=' . $this->current_page);
                        exit;
                    } else {
                        $next_page = $json_resp->links->next ?: false;
                    }
                } else {
                    $this->comment('Unfulfilled request :(');
                }
            } catch (ClientException $e) {
                echo Psr7\str($e->getRequest());
                echo Psr7\str($e->getResponse());
            }
        } while ($next_page !== false);

        if ($this->progress_bar) {
            $this->progress_bar->finish();
        }
    }
}
